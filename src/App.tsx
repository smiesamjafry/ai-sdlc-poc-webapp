import { useEffect, useState } from "react";
import { HashRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { addToCart, itemCount, loadCart, removeFromCart, saveCart, setQuantity, type CartLine } from "./lib/cart";
import { currentUser, logout } from "./lib/auth";
import { CatalogPage } from "./pages/CatalogPage";
import { CartPage } from "./pages/CartPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  const [cart, setCart] = useState<CartLine[]>(() => loadCart());
  const [user, setUser] = useState<string | null>(() => currentUser());

  useEffect(() => saveCart(cart), [cart]);

  return (
    <HashRouter>
      <header className="topbar">
        <Link to="/" className="brand">
          Pocket Shop
        </Link>
        <nav>
          <Link to="/cart">Cart ({itemCount(cart)})</Link>
          {user ? (
            <button
              type="button"
              className="link"
              onClick={() => {
                logout();
                setUser(null);
              }}
            >
              Sign out
            </button>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<CatalogPage onAdd={(id) => setCart((c) => addToCart(c, id))} />} />
          <Route
            path="/cart"
            element={
              <CartPage
                lines={cart}
                onQuantity={(id, q) => setCart((c) => setQuantity(c, id, q))}
                onRemove={(id) => setCart((c) => removeFromCart(c, id))}
              />
            }
          />
          <Route
            path="/checkout"
            element={
              user ? <CheckoutPage lines={cart} onPlaced={() => setCart([])} /> : <Navigate to="/login?next=checkout" />
            }
          />
          <Route path="/login" element={<LoginPage onLogin={setUser} />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
