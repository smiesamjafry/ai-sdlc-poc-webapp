// Environment is read once at startup. APP_ENV (not NODE_ENV) decides production rules.
export type AppEnv = "production" | "preview" | "development" | "test";

const DEV_JWT_SECRET = "dev-only-secret-change-me-dev-only-secret";

function list(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export interface Config {
  appEnv: AppEnv;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  corsOrigins: string[];
  previewOrigins: string[];
  storefrontUrl: string;
  redisPrefix: string;
  seedScale: "full" | "small";
  seedAdminPassword: string | null;
  seedStaffPassword: string | null;
  loginRateLimit: number;
  catalogRateLimit: number;
  version: string;
  warnings: string[];
}

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appEnv = (env.APP_ENV ?? "development") as AppEnv;
  if (!["production", "preview", "development", "test"].includes(appEnv)) {
    throw new ConfigError(`APP_ENV must be production, preview, development or test (got "${appEnv}")`);
  }
  const strict = appEnv === "production" || appEnv === "preview";
  const missing: string[] = [];
  const warnings: string[] = [];
  const need = (name: string, devDefault?: string) => {
    const v = env[name];
    if (v) return v;
    if (!strict && devDefault !== undefined) return devDefault;
    missing.push(name);
    return "";
  };
  const databaseUrl = need("DATABASE_URL", "postgres://pocket:pocket@localhost:55432/pocket");
  const redisUrl = need("REDIS_URL", "redis://localhost:56379");
  let jwtSecret = env.JWT_SECRET ?? "";
  if (!jwtSecret) {
    if (strict) missing.push("JWT_SECRET");
    else {
      jwtSecret = DEV_JWT_SECRET;
      warnings.push("JWT_SECRET not set: using a fixed development secret. Never do this in production.");
    }
  }
  const corsOrigins = list(env.CORS_ORIGINS);
  if (corsOrigins.length === 0) {
    if (strict) missing.push("CORS_ORIGINS");
    else corsOrigins.push("http://localhost:5173", "http://localhost:4173");
  }
  if (missing.length) {
    throw new ConfigError(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Copy server/.env.example and set them (APP_ENV=${appEnv}).`,
    );
  }
  return {
    appEnv,
    port: Number(env.PORT ?? 4000),
    databaseUrl,
    redisUrl,
    jwtSecret,
    corsOrigins,
    previewOrigins: list(env.PREVIEW_ORIGINS),
    storefrontUrl: env.STOREFRONT_URL ?? corsOrigins[0],
    redisPrefix: env.REDIS_PREFIX ?? "ps:",
    seedScale: env.SEED_SCALE === "small" ? "small" : "full",
    seedAdminPassword: env.SEED_ADMIN_PASSWORD || null,
    seedStaffPassword: env.SEED_STAFF_PASSWORD || null,
    loginRateLimit: Number(env.LOGIN_RATE_LIMIT_PER_MIN ?? 10),
    catalogRateLimit: Number(env.CATALOG_RATE_LIMIT_PER_MIN ?? 120),
    version: env.RENDER_GIT_COMMIT ?? env.GIT_SHA ?? "dev",
    warnings,
  };
}
