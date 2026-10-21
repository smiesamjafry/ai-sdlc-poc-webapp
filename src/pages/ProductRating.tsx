import { useState, type FormEvent } from "react";
import { api, ApiProblem } from "../lib/api";
import { IS_PREVIEW } from "../lib/env";
import { formatAverage, ratingCountLabel, STAR_VALUES, starsLabel, type RatingSummary } from "../lib/ratings";
import { useApi } from "../lib/store";

export const RATING_SAVED = "Thanks! Your rating was saved.";

/** Star rating on the product page: anyone can rate 1-5; the average and count are public. */
export function ProductRating({ slug }: { slug: string }) {
  const { data } = useApi<RatingSummary>(`/products/${slug}/ratings`, [slug]);
  const [saved, setSaved] = useState<RatingSummary | null>(null);
  const [stars, setStars] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const summary = saved ?? data;
  const average = summary && formatAverage(summary);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stars) return setMsg({ ok: false, text: "Choose 1 to 5 stars first." });
    setBusy(true);
    setMsg(null);
    try {
      setSaved(await api<RatingSummary>(`/products/${slug}/ratings`, { method: "POST", body: { stars } }));
      setStars(null);
      setMsg({ ok: true, text: RATING_SAVED });
    } catch (x) {
      setMsg({ ok: false, text: x instanceof ApiProblem ? `${x.fields.stars ?? x.detail} ${x.fix}` : "Couldn't save your rating." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rating">
      {summary && (average
        ? <p className="rating-summary"><span aria-hidden="true">★</span> <strong>{average}</strong> out of 5 · <span>{ratingCountLabel(summary.count)}</span></p>
        : <p className="rating-summary muted">No ratings yet</p>)}
      {!IS_PREVIEW && (
        <form onSubmit={submit}>
          <fieldset className="stars">
            <legend>Rate this product</legend>
            {STAR_VALUES.map((n) => (
              <label key={n} className={stars !== null && n <= stars ? "on" : undefined}>
                <input type="radio" name={`rating-${slug}`} value={n} aria-label={starsLabel(n)}
                  checked={stars === n} onChange={() => setStars(n)} />
                <span aria-hidden="true">★</span>
              </label>
            ))}
          </fieldset>
          <button type="submit" disabled={busy}>Submit rating</button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
    </div>
  );
}
