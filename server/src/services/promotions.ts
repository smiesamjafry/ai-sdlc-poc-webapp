import type { Promotion } from "@pocket/shared";
import type { Db, Tx } from "../db/pool";
import { ApiError } from "../lib/errors";

export interface PromoRow {
  id: string; code: string; name: string; type: "percentage" | "fixed" | "free_shipping"; value: number;
  scope_kind: "all" | "categories" | "products"; scope_ids: string[]; min_subtotal_cents: number;
  starts_at: Date | null; ends_at: Date | null; usage_limit: number | null; per_customer_limit: number | null;
  used_count: number; active: boolean;
}

export const couponInvalid = (reason: string, fix: string) =>
  new ApiError({ status: 422, code: "COUPON_INVALID", title: "This code can't be used", detail: reason, fix });

export function toPromotion(p: PromoRow): Promotion {
  const scope = p.scope_kind === "all" ? { kind: "all" as const } : { kind: p.scope_kind, ids: p.scope_ids };
  return { type: p.type, value: p.type === "free_shipping" ? 0 : p.value, scope, minSubtotalCents: p.min_subtotal_cents } as Promotion;
}

/** Validate a code for a cart. `lock` takes FOR UPDATE (checkout); customerKey enforces per-customer limits. */
export async function loadValidPromotion(
  db: Db | Tx, code: string, opts: { subtotalCents: number; customerKey: string | null; lock?: boolean; now?: Date },
): Promise<PromoRow> {
  const { rows } = await db.query(
    `SELECT * FROM promotions WHERE upper(code) = upper($1) ${opts.lock ? "FOR UPDATE" : ""}`, [code.trim()]);
  const p: PromoRow | undefined = rows[0];
  const now = opts.now ?? new Date();
  if (!p || !p.active) throw couponInvalid(`"${code}" is not a valid code.`, "Check the spelling or remove the code.");
  if (p.starts_at && p.starts_at > now) throw couponInvalid(`"${p.code}" is not active yet.`, "Try again once the promotion starts.");
  if (p.ends_at && p.ends_at <= now) throw couponInvalid(`"${p.code}" has expired.`, "Remove the code.");
  if (p.usage_limit !== null && p.used_count >= p.usage_limit) {
    throw couponInvalid(`"${p.code}" has reached its usage limit.`, "Remove the code.");
  }
  if (opts.subtotalCents < p.min_subtotal_cents) {
    throw couponInvalid(`"${p.code}" needs a subtotal of at least $${(p.min_subtotal_cents / 100).toFixed(2)}.`,
      "Add more items or remove the code.");
  }
  if (p.per_customer_limit !== null && opts.customerKey) {
    const { rows: r } = await db.query(
      "SELECT count(*)::int AS n FROM promotion_redemptions WHERE promotion_id = $1 AND customer_key = $2",
      [p.id, opts.customerKey]);
    if (r[0].n >= p.per_customer_limit) throw couponInvalid(`You have already used "${p.code}".`, "Remove the code.");
  }
  return p;
}
