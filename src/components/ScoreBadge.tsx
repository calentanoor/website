export function scoreTone(score: number | undefined) {
  if (score == null) return "none";
  if (score >= 65) return "good";
  if (score >= 45) return "mid";
  return "bad";
}

const badge = {
  none: "bg-border/60 text-muted",
  good: "bg-up/12 text-up",
  mid: "bg-neutral/12 text-neutral",
  bad: "bg-down/12 text-down",
};
const bar = { none: "bg-border", good: "bg-up", mid: "bg-neutral", bad: "bg-down" };

export function ScoreBadge({ score, large }: { score: number | undefined; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-semibold tabular-nums ${badge[scoreTone(score)]} ${
        large ? "h-11 min-w-14 px-3 text-xl" : "h-6 w-9 text-[13px]"
      }`}
    >
      {score ?? "–"}
    </span>
  );
}

export function ScoreBar({ score, className = "" }: { score: number | undefined; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-border/70 ${className}`}>
      <div className={`h-full rounded-full ${bar[scoreTone(score)]}`} style={{ width: `${score ?? 0}%` }} />
    </div>
  );
}

// Score with a small bar underneath – used for the headline "Gesamt" column.
export function ScoreMeter({ score }: { score: number | undefined }) {
  return (
    <div className="ml-auto flex w-11 flex-col items-end gap-1">
      <span className={`text-sm font-semibold tabular-nums ${scoreTone(score) === "none" ? "text-muted" : ""}`}>{score ?? "–"}</span>
      <ScoreBar score={score} />
    </div>
  );
}
