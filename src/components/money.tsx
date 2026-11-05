import { formatDop, formatUsd, formatCombinedDop } from "@/lib/format";

export function MoneyInline({
  dop,
  usd,
  rate,
}: {
  dop?: number | null;
  usd?: number | null;
  rate: number;
}) {
  const hasDop = dop !== null && dop !== undefined;
  const hasUsd = usd !== null && usd !== undefined;
  if (!hasDop && !hasUsd) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {hasDop && formatDop(dop)}
      {hasDop && hasUsd && (
        <span className="mx-1 text-muted-foreground">·</span>
      )}
      {hasUsd && formatUsd(usd)}
      {hasUsd && hasDop && (
        <span className="ml-1 text-xs text-muted-foreground">
          (= {formatCombinedDop(dop, usd, rate)})
        </span>
      )}
    </span>
  );
}
