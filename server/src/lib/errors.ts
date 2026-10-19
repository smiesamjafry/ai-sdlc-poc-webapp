// Errors are application/problem+json (RFC 9457) with a stable code catalog in docs/errors.md.
export const DOCS_BASE = "https://github.com/smiesamjafry/ai-sdlc-poc-webapp/blob/main/docs/errors.md";

export interface ProblemInit {
  status: number;
  code: string;
  title: string;
  detail?: string;
  fix: string;
  retryable?: boolean;
  fields?: Record<string, string>;
  retryAfterSec?: number;
  extra?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(public readonly p: ProblemInit) {
    super(p.detail ?? p.title);
  }
}

export const E = {
  validation: (fields: Record<string, string>) =>
    new ApiError({ status: 422, code: "VALIDATION_FAILED", title: "Some fields are invalid", fields,
      fix: "Correct the listed fields and resend the request." }),
  notFound: (what = "Resource") =>
    new ApiError({ status: 404, code: "NOT_FOUND", title: `${what} not found`,
      fix: "Check the id or slug; it may have been removed or you may not have access." }),
  routeNotFound: () =>
    new ApiError({ status: 404, code: "ROUTE_NOT_FOUND", title: "No such API route",
      fix: "See docs/api.md for the list of /api/v1 routes." }),
  unauthenticated: () =>
    new ApiError({ status: 401, code: "UNAUTHENTICATED", title: "Sign in required",
      fix: "Send Authorization: Bearer <access token> from POST /api/v1/auth/login." }),
  tokenExpired: () =>
    new ApiError({ status: 401, code: "TOKEN_EXPIRED", title: "Access token expired", retryable: true,
      fix: "Call POST /api/v1/auth/refresh with your refresh token, then retry once." }),
  tokenRevoked: () =>
    new ApiError({ status: 401, code: "TOKEN_REVOKED", title: "Session revoked",
      fix: "Sign in again with POST /api/v1/auth/login." }),
  epochChanged: () =>
    new ApiError({ status: 401, code: "AUTH_EPOCH_CHANGED", title: "The demo store was reset",
      fix: "Sign in again; all sessions end when the demo data is reset." }),
  accountDisabled: () =>
    new ApiError({ status: 401, code: "ACCOUNT_DISABLED", title: "This account is disabled",
      fix: "Ask a store admin to re-enable the account." }),
  badCredentials: () =>
    new ApiError({ status: 401, code: "INVALID_CREDENTIALS", title: "Email or password is incorrect",
      fix: "Check the email and password and try again." }),
  forbiddenRole: (needed: string) =>
    new ApiError({ status: 403, code: "FORBIDDEN_ROLE", title: "Only admins can do this",
      detail: `This action needs the ${needed} role.`, fix: "Ask an admin to perform this action." }),
  conflict: (code: string, title: string, fix: string, extra?: Record<string, unknown>) =>
    new ApiError({ status: 409, code, title, fix, extra }),
  rateLimited: (retryAfterSec: number) =>
    new ApiError({ status: 429, code: "RATE_LIMITED", title: "Too many requests", retryable: true, retryAfterSec,
      fix: `Wait ${retryAfterSec} seconds, then retry.` }),
  paymentDeclined: (reason: string) =>
    new ApiError({ status: 402, code: "PAYMENT_DECLINED", title: "Payment was declined", detail: reason,
      fix: "Use a different card. Send a new Idempotency-Key for the new attempt; your cart is unchanged." }),
  checkoutUnavailable: () =>
    new ApiError({ status: 503, code: "CHECKOUT_BUSY", title: "Checkout is busy", retryable: true, retryAfterSec: 2,
      detail: "Retry with the same Idempotency-Key; if the first attempt completed you will receive that order.",
      fix: "Wait 2 seconds and resend the same request with the same Idempotency-Key." }),
};

export function problemBody(p: ProblemInit, requestId: string) {
  return {
    type: `${DOCS_BASE}#${p.code.toLowerCase()}`,
    title: p.title,
    status: p.status,
    detail: p.detail ?? p.title,
    instance: requestId,
    requestId,
    code: p.code,
    fix: p.fix,
    retryable: p.retryable ?? false,
    ...(p.fields ? { fields: p.fields } : {}),
    ...(p.extra ?? {}),
  };
}
