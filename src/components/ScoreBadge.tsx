export function scoreColor(score: number | undefined) {
  if (score == null) return "bg-border text-muted";
  if (score >= 65) return "bg-up/15 text-up";
  if (score >= 45) return "bg-neutral/15 text-neutral";
  return "bg-down/15 text-down";
}

export function ScoreBadge({ score, large }: { score: number | undefined; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-semibold ${scoreColor(score)} ${
        large ? "min-w-14 px-3 py-1.5 text-xl" : "min-w-10 px-2 py-0.5 text-sm"
      }`}
    >
      {score ?? "–"}
    </span>
  );
}

export function ScoreBar({ score }: { score: number | undefined }) {
  const color = score == null ? "bg-border" : score >= 65 ? "bg-up" : score >= 45 ? "bg-neutral" : "bg-down";
  return (
    <div className="h-1.5 w-full rounded-full bg-border">
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score ?? 0}%` }} />
    </div>
  );
}
