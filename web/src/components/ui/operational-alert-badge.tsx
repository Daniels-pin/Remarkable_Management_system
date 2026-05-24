import { cn } from "@/lib/utils";

type OperationalAlertBadgeProps = {
  count: number;
  className?: string;
  /** Cap display at 99+ for compact nav use. */
  maxDisplay?: number;
};

/**
 * Compact red pill for operational pending counts — Apple-style, minimal, urgent.
 */
export function OperationalAlertBadge({
  count,
  className,
  maxDisplay = 99,
}: OperationalAlertBadgeProps) {
  if (count <= 0) return null;

  const label = count > maxDisplay ? `${maxDisplay}+` : String(count);

  return (
    <span
      className={cn(
        "inline-flex min-h-[1.125rem] min-w-[1.125rem] shrink-0 items-center justify-center rounded-full",
        "bg-[#E5484D] px-1.5 text-[10px] font-semibold tabular-nums leading-none text-white",
        "shadow-[0_0_0_1px_rgba(229,72,77,0.12)]",
        className,
      )}
      aria-label={`${count} pending`}
    >
      {label}
    </span>
  );
}
