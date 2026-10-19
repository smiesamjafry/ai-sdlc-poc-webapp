// Tests use their own database (pocket_test) and Redis prefix so they never touch local dev data.
process.env.APP_ENV = "test";
process.env.DATABASE_URL ??= "postgres://pocket:pocket@localhost:55432/pocket_test";
process.env.REDIS_URL ??= "redis://localhost:56379";
process.env.REDIS_PREFIX = "pt:";
process.env.SEED_SCALE = "small";
process.env.LOGIN_RATE_LIMIT_PER_MIN = "1000";
process.env.CATALOG_RATE_LIMIT_PER_MIN = "100000";
process.env.CORS_ORIGINS = "https://store.example.com";
process.env.PREVIEW_ORIGINS = "https://smiesamjafry.github.io";
