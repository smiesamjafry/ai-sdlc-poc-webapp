import { formatPrice } from "@pocket/shared";
import type { ReactNode } from "react";
import type { ApiProblem } from "../lib/api";

export const Price = ({ cents, compareAt }: { cents: number; compareAt?: number | null }) => (
  <span className="price">
    {formatPrice(cents)}
    {compareAt && compareAt > cents ? <s className="compare-at">{formatPrice(compareAt)}</s> : null}
  </span>
);

export const Loading = ({ label = "Loading…" }: { label?: string }) => <p className="muted" role="status">{label}</p>;

export function ErrorNote({ error, onRetry }: { error: ApiProblem | null; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <strong>{error.detail}</strong>
      {error.fix ? <span> {error.fix}</span> : null}
      {onRetry ? <button type="button" className="link" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

/** Images in the catalog are relative paths served next to the SPA (works under any base path). */
export const imgSrc = (url: string | null) => url ?? "products/placeholder.svg";

export function FieldError({ fields, name }: { fields: Record<string, string>; name: string }) {
  return fields[name] ? <span className="field-error">{fields[name]}</span> : null;
}
