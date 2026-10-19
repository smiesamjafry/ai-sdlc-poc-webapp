import pino from "pino";

// Secrets never reach logs: these paths are censored wherever they appear in a log object.
export const REDACT_PATHS = [
  "authorization", "*.authorization", "headers.authorization", "req.headers.authorization",
  "password", "*.password", "refreshToken", "*.refreshToken", "token", "*.token",
  "card", "*.card", "cardNumber", "*.cardNumber", "databaseUrl", "redisUrl", "jwtSecret",
];

export const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.APP_ENV === "test" ? "silent" : "info"),
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  base: { service: "pocket-shop-api" },
});

/** Strip credentials from connection strings before they appear in messages. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ":" + u.port : ""}${u.pathname}`;
  } catch {
    return "[unparseable url]";
  }
}
