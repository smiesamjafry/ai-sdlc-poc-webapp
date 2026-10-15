import { beforeEach, describe, expect, it } from "vitest";
import { currentUser, DEMO_USER, login, logout } from "./auth";

describe("auth", () => {
  beforeEach(() => localStorage.clear());

  it("signs in the demo user case-insensitively on email", () => {
    expect(login(DEMO_USER.email.toUpperCase(), DEMO_USER.password)).toEqual({ ok: true });
    expect(currentUser()).toBe(DEMO_USER.email);
  });

  it("rejects a wrong password", () => {
    expect(login(DEMO_USER.email, "nope").ok).toBe(false);
    expect(currentUser()).toBeNull();
  });

  it("signs out", () => {
    login(DEMO_USER.email, DEMO_USER.password);
    logout();
    expect(currentUser()).toBeNull();
  });
});
