import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiProblem, endSession } from "../lib/api";
import { useStore } from "../lib/store";
import { ErrorNote } from "../components/ui";

export function LoginPage() {
  const { login } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reason = params.get("reason");
  useEffect(() => { if (reason === "reset") endSession(); }, [reason]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const user = await login(email, password);
      const next = params.get("next");
      navigate(next ? `/${next}` : user.role === "customer" ? "/" : "/admin");
    } catch {
      // stay on the form
    }
  }

  return (
    <section>
      <h1>Sign in</h1>
      {params.get("reason") === "admin" && <p className="notice">Not authorised: sign in with a staff or admin account.</p>}
      {params.get("reason") === "reset" && <p className="notice" role="status">Demo data restored. Everyone was signed out; sign in again.</p>}
      <form onSubmit={submit} className="stack">
        <label className="field">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Sign in</button>
        <p className="small">New here? <Link to="/register">Create an account</Link></p>
      </form>
    </section>
  );
}

export function RegisterPage() {
  const { register } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState<ApiProblem | null>(null);
  const [f, setF] = useState({ name: "", email: "", password: "" });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await register(f.name, f.email, f.password); navigate("/account"); } catch (err) { if (err instanceof ApiProblem) setError(err); }
  }
  const fields = error?.fields ?? {};
  return (
    <section>
      <h1>Create account</h1>
      <form onSubmit={submit} className="stack">
        <label className="field">Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label className="field">Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />{fields.email && <span className="field-error">{fields.email}</span>}</label>
        <label className="field">Password<input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />{fields.password && <span className="field-error">{fields.password}</span>}</label>
        <ErrorNote error={error} />
        <button type="submit">Create account</button>
      </form>
    </section>
  );
}
