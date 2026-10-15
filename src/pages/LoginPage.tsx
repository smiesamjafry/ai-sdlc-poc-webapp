import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../lib/auth";

export function LoginPage({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = login(email, password);
    if (result.ok) {
      onLogin(email.trim().toLowerCase());
      navigate(params.get("next") === "checkout" ? "/checkout" : "/");
    }
  }

  return (
    <section>
      <h1>Sign in</h1>
      <form onSubmit={submit} className="stack">
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Sign in</button>
      </form>
    </section>
  );
}
