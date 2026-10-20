import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base + HashRouter lets the same build run from any static host path.
export default defineConfig({
  base: "./",
  // Build commit for the "store is updating" banner (Render sets RENDER_GIT_COMMIT).
  define: { "import.meta.env.VITE_BUILD_SHA": JSON.stringify(process.env.VITE_BUILD_SHA ?? process.env.RENDER_GIT_COMMIT ?? "dev") },
  plugins: [react()],
  test: { environment: "jsdom", globals: true, include: ["src/**/*.test.{ts,tsx}", "shared/src/**/*.test.ts"], setupFiles: ["src/test-setup.ts"] },
});
