"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

const CLEANUP_DELAY_MS = 100;

function clearStaleInteractionBlockers() {
  const openDialog = document.querySelector('[role="dialog"][data-state="open"]');
  const openMenu = document.querySelector('[role="menu"][data-state="open"]');
  if (openDialog || openMenu) return;

  document.querySelectorAll("[data-radix-dialog-overlay]").forEach((node) => {
    node.remove();
  });

  document.querySelectorAll("[data-radix-popper-content-wrapper]").forEach((node) => {
    if (!node.querySelector('[data-state="open"]')) {
      node.remove();
    }
  });

  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.style.removeProperty("pointer-events");
  document.body.removeAttribute("data-scroll-locked");
}

/**
 * Safety net for orphaned Radix layers after client navigations.
 * Cross-workspace switches use full document navigation; this covers in-app routes.
 */
export function NavigationStabilizer() {
  const pathname = usePathname();

  React.useEffect(() => {
    const timer = window.setTimeout(clearStaleInteractionBlockers, CLEANUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
