import { cleanupLegacyStorage } from "./api";
import { noCacheRequested } from "./env";

describe("storefront environment helpers", () => {
  it("removes the static shop's old localStorage keys on first load", () => {
    localStorage.setItem("pocket-shop.cart", "[]");
    localStorage.setItem("pocket-shop.session", "demo@shop.test");
    localStorage.setItem("ps.cartToken", "keep-me");
    cleanupLegacyStorage();
    expect(localStorage.getItem("pocket-shop.cart")).toBeNull();
    expect(localStorage.getItem("pocket-shop.session")).toBeNull();
    expect(localStorage.getItem("ps.cartToken")).toBe("keep-me");
  });

  it("detects ?nocache=1 in the query or the hash route", () => {
    window.history.replaceState(null, "", "/#/products?nocache=1");
    expect(noCacheRequested()).toBe(true);
    window.history.replaceState(null, "", "/#/products");
    expect(noCacheRequested()).toBe(false);
  });
});
