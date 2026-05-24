"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Scissors, Sofa } from "lucide-react";
import Link from "next/link";

import { MinimalHeader } from "@/components/layout/minimal-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const modules = [
  {
    title: "Barbershop",
    description:
      "Daily ledger, team, expenses, finance, and operational controls.",
    href: "/barbershop/dashboard",
    icon: Scissors,
  },
  {
    title: "Furniture",
    description: "Orders, production tracking, and showroom financial posture.",
    href: "/furniture/dashboard",
    icon: Sofa,
  },
] as const;

export default function ModulesPage() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="flex min-h-[100dvh] flex-col bg-[var(--background)]"
      initial={reduce ? false : { opacity: 0 }}
      animate={reduce ? false : { opacity: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <MinimalHeader />
      <motion.div
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-12 md:px-8 md:py-20"
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={reduce ? false : { opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.06, duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }}
      >
        <div className="mb-12 space-y-4 border-b border-[var(--border)] pb-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
            Owner console
          </p>
          <motion.div
            className="space-y-3"
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={reduce ? false : { opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.08, duration: 0.28, ease: [0.22, 1, 0.36, 1] as const }}
          >
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-[1.75rem]">
              Business portfolio
            </h1>
            <p className="max-w-lg text-sm leading-relaxed text-[var(--muted-foreground)]">
              Select which part of the Remarkable ecosystem to open. This layer
              is reserved for the account owner — operational teams enter
              their workspace directly at sign-in.
            </p>
          </motion.div>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2">
          {modules.map((m, i) => (
            <motion.li
              key={m.href}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={reduce ? false : { opacity: 1, y: 0 }}
              transition={{
                delay: reduce ? 0 : 0.1 + 0.05 * i,
                duration: 0.26,
                ease: [0.22, 1, 0.36, 1] as const,
              }}
            >
              <Link href={m.href} className="group block h-full">
                <Card className="h-full border-[var(--border)] transition-[box-shadow,transform,border-color] duration-200 ease-out hover:border-[var(--foreground)]/20 hover:shadow-[var(--shadow-elevated)]">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
                    <motion.div
                      className="space-y-2.5"
                      whileHover={reduce ? undefined : { x: 1 }}
                      transition={{ duration: 0.18 }}
                    >
                      <motion.div
                        className="flex items-center gap-2.5"
                        whileHover={reduce ? undefined : { scale: 1.02 }}
                        transition={{ duration: 0.18 }}
                      >
                        <m.icon className="h-4 w-4 text-[var(--muted-foreground)]" />
                        <CardTitle className="text-base font-medium tracking-tight">
                          {m.title}
                        </CardTitle>
                        {"comingSoon" in m && m.comingSoon ? (
                          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
                            Soon
                          </span>
                        ) : null}
                      </motion.div>
                      <CardDescription className="text-sm leading-relaxed">
                        {m.description}
                      </CardDescription>
                    </motion.div>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardHeader>
                </Card>
              </Link>
            </motion.li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}
