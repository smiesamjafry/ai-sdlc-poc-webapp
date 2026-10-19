// npm run dev: API (watch mode) + Vite, one terminal. Ctrl+C stops both.
import { spawn } from "node:child_process";

const procs = [
  spawn("npm", ["run", "dev", "-w", "server"], { stdio: "inherit" }),
  spawn("npx", ["vite", "--port", "5173"], { stdio: "inherit", env: { ...process.env, VITE_API_URL: process.env.VITE_API_URL ?? "http://localhost:4000" } }),
];
const stop = () => { for (const p of procs) p.kill("SIGTERM"); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => { if (code) { console.error(`dev: a process exited with ${code}`); stop(); } });
