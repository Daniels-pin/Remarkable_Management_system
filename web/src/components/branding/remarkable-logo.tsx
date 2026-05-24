"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import * as React from "react";

import { cn } from "@/lib/utils";

const LOGO_SRC = "/branding/remarkable-barbershop.png";

export type BusinessModuleBrand = "barbershop" | "furniture";

const MODULE_LABEL: Record<BusinessModuleBrand, string> = {
  barbershop: "BARBERSHOP",
  furniture: "FURNITURE",
};

const MODULE_ARIA: Record<BusinessModuleBrand, string> = {
  barbershop: "Remarkable Barbershop",
  furniture: "Remarkable Furniture",
};

type RemarkableLogoProps = {
  className?: string;
  /** Full lockup vs icon-only treatment (icon uses tighter crop visually via scale). */
  variant?: "full" | "mark";
  priority?: boolean;
};

/**
 * Barbershop lockup. Drop `public/branding/remarkable-barbershop.png` (white on black)
 * for dark-friendly mark; light theme inverts for charcoal-on-light.
 */
export function RemarkableLogo({
  className,
  variant = "full",
  priority,
}: RemarkableLogoProps) {
  const { resolvedTheme } = useTheme();
  const [failed, setFailed] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const invertForLight =
    mounted && resolvedTheme === "light" ? "invert-[0.92] hue-rotate-180" : "";

  if (failed) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-1 text-center",
          className,
        )}
      >
        <span
          className={cn(
            "font-serif text-lg font-medium tracking-[0.22em] text-[var(--foreground)]",
            variant === "mark" && "text-base tracking-[0.18em]",
          )}
        >
          REMARKABLE
        </span>
        {variant === "full" ? (
          <span className="text-[9px] font-serif uppercase tracking-[0.26em] text-[var(--muted-foreground)]">
            BARBERSHOP
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative select-none",
        variant === "full" ? "h-24 w-44" : "h-10 w-10",
        className,
      )}
      data-variant={variant}
    >
      <Image
        src={LOGO_SRC}
        alt="Remarkable Barbershop"
        fill
        priority={priority}
        className={cn(
          "object-contain object-center transition-[filter,opacity] duration-300",
          invertForLight,
          variant === "mark" && "scale-110",
        )}
        sizes={variant === "full" ? "176px" : "40px"}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/** Image-based compact mark (e.g. favicon-style contexts). Prefer {@link RemarkableWordmark} in app chrome. */
export function RemarkableMark({ className }: { className?: string }) {
  return <RemarkableLogo variant="mark" className={className} />;
}

type RemarkableWordmarkProps = {
  className?: string;
  /** Expanded sidebar: stacked lockup. Compact: typographic monogram for narrow rail. Header: dense for top bar. */
  variant?: "full" | "compact" | "header";
  /** Operational module label beneath REMARKABLE. Defaults to barbershop for existing chrome. */
  module?: BusinessModuleBrand;
};

/**
 * Typography-only branding for in-app chrome (sidebar, headers).
 * Image lockup remains on {@link RemarkableLogo} for auth screens.
 */
export function RemarkableWordmark({
  className,
  variant = "full",
  module = "barbershop",
}: RemarkableWordmarkProps) {
  const moduleLabel = MODULE_LABEL[module];
  const ariaLabel = MODULE_ARIA[module];

  if (variant === "compact") {
    return (
      <span
        className={cn(
          "font-serif text-lg font-medium tracking-[0.32em] text-[var(--foreground)]",
          className,
        )}
        aria-label={ariaLabel}
      >
        R
      </span>
    );
  }

  if (variant === "header") {
    return (
      <div
        className={cn(
          "flex flex-col items-start gap-0.5 leading-none",
          className,
        )}
        aria-label={ariaLabel}
      >
        <span className="font-serif text-[11px] font-medium uppercase tracking-[0.26em] text-[var(--foreground)]">
          REMARKABLE
        </span>
        <span className="font-serif text-[8px] font-normal uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
          {moduleLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col items-start gap-1 leading-none", className)}
      aria-label={ariaLabel}
    >
      <span className="font-serif text-xs font-medium uppercase tracking-[0.3em] text-[var(--foreground)]">
        REMARKABLE
      </span>
      <span className="font-serif text-[9px] font-normal uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
        {moduleLabel}
      </span>
    </div>
  );
}
