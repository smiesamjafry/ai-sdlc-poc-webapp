import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ApiError, E, problemBody } from "../lib/errors";
import { log } from "../lib/log";
import { RetriesExhausted } from "../db/pool";
import type { Config } from "../lib/config";

const REQ_ID = /^[A-Za-z0-9-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction) {
  const inbound = req.header("x-request-id");
  req.id = inbound && REQ_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    log.info({
      request_id: req.id, method: req.method, path: req.path, status: res.statusCode,
      duration_ms: Number((process.hrtime.bigint() - started) / 1_000_000n), user_id: req.user?.id ?? null,
    }, "request");
  });
  next();
}

/**
 * CORS. Full access only for configured storefront origins. Preview origins (GitHub Pages PR previews)
 * may make anonymous GET/HEAD calls; any preflight asking for Authorization from them is refused.
 */
export function cors(cfg: Config) {
  const exposed = "X-Cache, X-Cache-Key, X-Request-Id, Retry-After";
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (!origin) return next();
    const full = cfg.corsOrigins.includes(origin);
    const previewOnly = !full && cfg.previewOrigins.includes(origin);
    if (!full && !previewOnly) {
      if (req.method === "OPTIONS") return res.status(403).end();
      return next();
    }
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      const wantHeaders = (req.header("access-control-request-headers") ?? "").toLowerCase();
      const wantMethod = (req.header("access-control-request-method") ?? "GET").toUpperCase();
      if (previewOnly && (wantHeaders.includes("authorization") || !["GET", "HEAD"].includes(wantMethod))) {
        return res.status(403).end();
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", previewOnly ? "GET, HEAD" : "GET, HEAD, POST, PUT, PATCH, DELETE");
      res.setHeader("Access-Control-Allow-Headers", previewOnly
        ? "Content-Type, X-Request-Id"
        : "Authorization, Content-Type, Idempotency-Key, X-Cart-Token, X-Order-Token, X-Request-Id");
      res.setHeader("Access-Control-Max-Age", "600");
      return res.status(204).end();
    }
    if (previewOnly && (req.header("authorization") || !["GET", "HEAD"].includes(req.method))) {
      return next(new ApiError({ status: 403, code: "PREVIEW_READ_ONLY", title: "Preview builds are read-only",
        fix: "Use the production storefront, or a [render preview] environment, to sign in or check out." }));
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Expose-Headers", exposed);
    next();
  };
}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw zodToApi(r.error);
  return r.data;
}

function zodToApi(err: ZodError) {
  const fields: Record<string, string> = {};
  for (const i of err.issues) fields[i.path.join(".") || "_"] = i.message;
  return E.validation(fields);
}

export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(E.routeNotFound());
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let apiErr: ApiError;
  if (err instanceof ApiError) apiErr = err;
  else if (err instanceof ZodError) apiErr = zodToApi(err);
  else if (err instanceof RetriesExhausted) apiErr = E.checkoutUnavailable();
  else if ((err as { type?: string }).type === "entity.parse.failed") {
    apiErr = new ApiError({ status: 400, code: "MALFORMED_JSON", title: "Request body is not valid JSON",
      fix: "Send a JSON body with Content-Type: application/json." });
  } else {
    log.error({ request_id: req.id, err: (err as Error).message, stack: (err as Error).stack }, "unhandled_error");
    apiErr = new ApiError({ status: 500, code: "INTERNAL", title: "Something went wrong", retryable: true,
      fix: `Retry once; if it fails again, report request id ${req.id}.` });
  }
  if (apiErr.p.retryAfterSec) res.setHeader("Retry-After", String(apiErr.p.retryAfterSec));
  res.status(apiErr.p.status).type("application/problem+json").send(JSON.stringify(problemBody(apiErr.p, req.id)));
}
