import { defineConfig } from "vitest/config";

// API integration tests run against real Postgres + Redis (docker-compose locally, service containers in CI).
// Files run one at a time because they share one database; each file reseeds what it needs.
export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    setupFiles: ["test/setup-env.ts"],
  },
});
