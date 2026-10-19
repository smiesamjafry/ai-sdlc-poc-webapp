export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
/** Pull-request preview builds on GitHub Pages are browse-only: no sign-in, no cart writes. */
export const IS_PREVIEW = import.meta.env.VITE_PREVIEW === "1";
export const BUILD_SHA = import.meta.env.VITE_BUILD_SHA ?? "dev";

/** `?nocache=1` (or `#/...?nocache=1`) forwards to every API call so the presenter can show Postgres-only timing. */
export function noCacheRequested(): boolean {
  const s = window.location.search + window.location.hash;
  return /[?&]nocache=1\b/.test(s);
}
export function debugRequested(): boolean {
  const s = window.location.search + window.location.hash;
  return /[?&]debug=1\b/.test(s);
}
