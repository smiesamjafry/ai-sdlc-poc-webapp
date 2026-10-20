import { useEffect, useState, type FormEvent } from "react";
import { api, ApiProblem } from "../lib/api";
import { IS_PREVIEW } from "../lib/env";
import { useApi } from "../lib/store";
import type { ProductQuestion } from "../lib/types";

export const QUESTION_THANKS = "Thanks! Your question will appear once it has been answered.";

/** Q&A on the product page: anyone can ask; only answered questions are listed. */
export function ProductQuestions({ slug }: { slug: string }) {
  // Re-read on every history visit (back/forward or reopening the same link): answers can arrive at any time.
  const [visit, setVisit] = useState(0);
  useEffect(() => {
    const onPop = () => setVisit((v) => v + 1);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const { data } = useApi<{ items: ProductQuestion[] }>(`/products/${slug}/questions`, [slug, visit]);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const question = text.trim();
    if (!question) return setMsg({ ok: false, text: "Type a question before sending." });
    setBusy(true);
    setMsg(null);
    try {
      await api(`/products/${slug}/questions`, { method: "POST", body: { question } });
      setText("");
      setMsg({ ok: true, text: QUESTION_THANKS });
    } catch (x) {
      setMsg({ ok: false, text: x instanceof ApiProblem ? `${x.fields.question ?? x.detail} ${x.fix}` : "Couldn't send your question." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="qa" aria-labelledby="qa-heading">
      <h2 id="qa-heading">Questions &amp; Answers</h2>
      {data && data.items.length === 0 && <p className="muted">No answered questions yet.</p>}
      {data && data.items.length > 0 && (
        <ul className="plain qa-list">
          {data.items.map((q) => (
            <li key={q.id}>
              <p><strong>Q:</strong> {q.question}</p>
              <p><strong>A:</strong> {q.answer}</p>
            </li>
          ))}
        </ul>
      )}
      {!IS_PREVIEW && (
        <form onSubmit={submit}>
          <label className="field">Your question
            <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={3} />
          </label>
          <button type="submit" disabled={busy}>Ask a question</button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </section>
  );
}
