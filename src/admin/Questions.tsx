import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiProblem } from "../lib/api";
import { useApi } from "../lib/store";
import type { AdminQuestion } from "../lib/types";
import { Empty, ErrorNote, Loading } from "../components/ui";

export function QuestionsPage() {
  const { data, error, loading, reload } = useApi<{ items: AdminQuestion[] }>("/admin/questions");
  const [err, setErr] = useState<ApiProblem | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function answer(q: AdminQuestion, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = String(new FormData(e.currentTarget).get("answer"));
    setErr(null);
    setSaved(null);
    try {
      await api(`/admin/questions/${q.id}/answer`, { method: "POST", body: { answer: text } });
      setSaved(`Answered: "${q.question}" is now shown on ${q.productName}.`);
      reload();
    } catch (x) { if (x instanceof ApiProblem) setErr(x); }
  }

  return (
    <section>
      <h1>Questions</h1>
      <p className="muted">Unanswered product questions. Saving an answer publishes the question and answer on the product page.</p>
      {loading && <Loading />}
      <ErrorNote error={error ?? err} />
      {saved && <p role="status">{saved}</p>}
      {data && data.items.length === 0 && <Empty>No unanswered questions.</Empty>}
      <ul className="plain qa-list">
        {data?.items.map((q) => (
          <li key={q.id}>
            <p><Link to={`/products/${q.productSlug}`}>{q.productName}</Link> <span className="muted small">{new Date(q.createdAt).toLocaleString()}</span></p>
            <p>{q.question}</p>
            <form onSubmit={(e) => answer(q, e)}>
              <label className="field">Answer<textarea name="answer" required maxLength={2000} rows={2} /></label>
              <button type="submit">Save answer</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
