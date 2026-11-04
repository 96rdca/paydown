import { formatDop, formatUsd, formatCombinedDop } from "@/lib/format";

type MoneyProps = {
  dop?: number | null;
  usd?: number | null;
  rate: number;
  label?: string;
  size?: "sm" | "md" | "lg";
  emphasize?: "dop" | "combined";
};

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl font-semibold tracking-tight",
};

export function Money({
  dop,
  usd,
  rate,
  label,
  size = "md",
  emphasize = "combined",
}: MoneyProps) {
  const hasDop = dop !== null && dop !== undefined;
  const hasUsd = usd !== null && usd !== undefined;
  const combined = formatCombinedDop(dop, usd, rate);
  const mainText = emphasize === "dop" ? formatDop(dop) : combined;

  return (
    <div className="flex flex-col">
      {label && (
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      )}
      <span className={sizeClasses[size]}>{mainText}</span>
      {(hasDop || hasUsd) && emphasize === "combined" && (hasDop || hasUsd) && (
        <span className="text-xs text-muted-foreground">
          {hasDop && formatDop(dop)}
          {hasDop && hasUsd && " · "}
          {hasUsd && formatUsd(usd)}
        </span>
      )}
    </div>
  );
}

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
