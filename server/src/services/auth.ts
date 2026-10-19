import bcrypt from "bcryptjs";
import { SignJWT, errors as joseErrors, jwtVerify } from "jose";
import type { NextFunction, Request, Response } from "express";
import type { Db, Tx } from "../db/pool";
import type { Config } from "../lib/config";
import { E } from "../lib/errors";
import { randomToken, sha256, uuid } from "../lib/ids";

export type Role = "customer" | "staff" | "admin";
export interface AuthUser { id: string; email: string; name: string; role: Role; ep: number }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { id: string; user?: AuthUser }
  }
}

const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_DAYS = 30;
export const REFRESH_GRACE_MS = 10_000;

export class AuthService {
  private key: Uint8Array;
  constructor(private db: Db, cfg: Config) {
    this.key = new TextEncoder().encode(cfg.jwtSecret);
  }

  async issue(user: { id: string; role: Role; token_version: number }, familyId = uuid()) {
    const { rows } = await this.db.query("SELECT auth_epoch FROM app_meta");
    const ep: number = rows[0].auth_epoch;
    const accessToken = await new SignJWT({ role: user.role, tv: user.token_version, ep })
      .setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt()
      .setExpirationTime(`${ACCESS_TTL_S}s`).sign(this.key);
    const refreshToken = randomToken();
    await this.db.query(
      `INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at)
       VALUES ($1,$2,$3,$4, now() + interval '${REFRESH_TTL_DAYS} days')`,
      [uuid(), user.id, familyId, sha256(refreshToken)],
    );
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_S };
  }

  async login(email: string, password: string) {
    const { rows } = await this.db.query(
      "SELECT id, email, name, role, status, password_hash, token_version FROM users WHERE email = $1",
      [email.trim().toLowerCase()]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) throw E.badCredentials();
    if (u.status !== "active") throw E.accountDisabled();
    return { user: publicUser(u), ...(await this.issue(u)) };
  }

  /**
   * Rotate a refresh token. A token rotated in the last 10 s is accepted again (two tabs or a lost
   * response) and gets a fresh pair without revoking the family; later reuse revokes the whole family.
   */
  async refresh(token: string) {
    const { rows } = await this.db.query(
      `SELECT rt.*, u.role, u.status, u.token_version, u.email, u.name FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = $1`, [sha256(token)]);
    const rt = rows[0];
    if (!rt || rt.revoked_at || new Date(rt.expires_at) < new Date()) throw E.tokenRevoked();
    if (rt.status !== "active") throw E.accountDisabled();
    if (rt.rotated_at) {
      if (Date.now() - new Date(rt.rotated_at).getTime() > REFRESH_GRACE_MS) {
        await this.db.query("UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1", [rt.family_id]);
        throw E.tokenRevoked();
      }
    } else {
      const upd = await this.db.query(
        "UPDATE refresh_tokens SET rotated_at = now() WHERE id = $1 AND rotated_at IS NULL", [rt.id]);
      void upd;
    }
    const user = { id: rt.user_id, role: rt.role as Role, token_version: rt.token_version };
    return { user: publicUser({ ...rt, id: rt.user_id }), ...(await this.issue(user, rt.family_id)) };
  }

  async logout(token: string) {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id =
         (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`, [sha256(token)]);
  }

  async revokeAll(tx: Db | Tx, userId: string) {
    await tx.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [userId]);
    await tx.query("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
  }

  /** Verify the bearer token; one query loads the user and the current auth epoch. */
  async verify(token: string): Promise<AuthUser> {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] }));
    } catch (err) {
      if (err instanceof joseErrors.JWTExpired) throw E.tokenExpired();
      throw E.unauthenticated();
    }
    const { rows } = await this.db.query(
      `SELECT u.id, u.email, u.name, u.role, u.status, u.token_version, m.auth_epoch
       FROM users u CROSS JOIN app_meta m WHERE u.id = $1`, [payload.sub]);
    const u = rows[0];
    if (!u) throw E.epochChanged();
    if (payload.ep !== u.auth_epoch) throw E.epochChanged();
    if (u.status !== "active") throw E.accountDisabled();
    if (payload.tv !== u.token_version) throw E.tokenRevoked();
    return { id: u.id, email: u.email, name: u.name, role: u.role, ep: u.auth_epoch };
  }

  /** Attach req.user when a bearer token is present; reject only invalid tokens. */
  middleware() {
    return async (req: Request, _res: Response, next: NextFunction) => {
      const h = req.header("authorization");
      if (!h) return next();
      const m = /^Bearer (.+)$/.exec(h);
      if (!m) return next(E.unauthenticated());
      try {
        req.user = await this.verify(m[1]);
        next();
      } catch (err) {
        next(err);
      }
    };
  }
}

export function publicUser(u: { id: string; email: string; name: string; role: string }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role as Role };
}

export const requireUser = (req: Request, _res: Response, next: NextFunction) =>
  next(req.user ? undefined : E.unauthenticated());

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(E.unauthenticated());
  if (!roles.includes(req.user.role)) return next(E.forbiddenRole(roles.includes("staff") ? "staff" : "admin"));
  next();
};

/**
 * Fence for every mutating transaction made with a user token: holds app_meta FOR SHARE so a demo reset
 * waits for us, and fails if the store was reset after the token was issued.
 */
export async function fenceEpoch(tx: Tx, user: AuthUser | undefined) {
  const { rows } = await tx.query("SELECT auth_epoch FROM app_meta FOR SHARE");
  if (user && rows[0].auth_epoch !== user.ep) throw E.epochChanged();
}
