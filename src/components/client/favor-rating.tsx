import { Star } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getFavorRatingStatus, submitFavorRating } from "@/lib/marketplace-repo";

/**
 * Rating after completion. Foundation's submit_favor_rating decides who may
 * rate, prevents duplicates and only allows completed favors.
 */
export function FavorRating({ favorId, languageCode }: { favorId: string; languageCode: string }) {
  const es = languageCode.startsWith("es");
  const [done, setDone] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRate, setCanRate] = useState<boolean | null>(null);

  const refresh = () =>
    getFavorRatingStatus(favorId)
      .then((status) => {
        if (status && (status["already_rated"] || status["has_rated"] || status["rated"])) {
          setDone(true);
          return;
        }
        setCanRate(status ? status["can_rate"] !== false : false);
      })
      .catch(() => setCanRate(false));

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorId]);

  const messages: Record<string, [string, string]> = {
    favor_not_completed: ["El favor aún no está completado.", "The favor is not completed yet."],
    not_authorized: ["No puedes calificar este favor.", "You can't rate this favor."],
    invalid_rating: ["La calificación no es válida.", "The rating is not valid."],
    invalid_comment: ["El comentario no es válido.", "The comment is not valid."],
    favor_not_found: ["No encontramos este favor.", "We couldn't find this favor."],
  };

  if (done) {
    return (
      <p className="mt-5 text-sm text-muted-foreground">
        {es ? "Ya calificaste este favor." : "You already rated this favor."}
      </p>
    );
  }

  if (canRate !== true) return null;

  const send = async () => {
    if (rating < 1) return;
    setBusy(true);
    setError(null);
    try {
      await submitFavorRating(favorId, rating, comment.trim());
      setDone(true);
      void refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
      if (/already|duplicate/i.test(msg)) setDone(true);
      else {
        const known = messages[msg];
        setError(
          known
            ? known[es ? 0 : 1]
            : es
              ? "No se pudo guardar la calificación."
              : "Could not save the rating.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 rounded-2xl border border-border p-4">
      <p className="text-sm font-medium">{es ? "Califica el favor" : "Rate this favor"}</p>
      <div className="mt-2 flex gap-1" role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n}`}
            onClick={() => setRating(n)}
            className="p-1"
          >
            <Star className={n <= rating ? "size-6 fill-primary text-primary" : "size-6 text-muted-foreground"} />
          </button>
        ))}
      </div>
      <Textarea
        className="mt-3"
        value={comment}
        maxLength={500}
        onChange={(e) => setComment(e.target.value)}
        placeholder={es ? "Comentario (opcional)" : "Comment (optional)"}
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <Button className="mt-3 w-full" size="touch" disabled={busy || rating < 1} onClick={() => void send()}>
        {es ? "Enviar calificación" : "Submit rating"}
      </Button>
    </div>
  );
}
