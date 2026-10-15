import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base + HashRouter lets the same build run at the Pages root
// and under /pr-preview/pr-N/ for pull request previews.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { environment: "jsdom", globals: true, include: ["src/**/*.test.ts"], setupFiles: ["src/test-setup.ts"] },
});
