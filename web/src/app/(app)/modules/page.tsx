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
      "Daily ledger, barbers, expenses, finance, and operational controls.",
    href: "/barbershop/dashboard",
    icon: Scissors,
  },
  {
    title: "Furniture",
    description: "Coming soon — inventory and showroom operations.",
    href: "/furniture",
    icon: Sofa,
  },
] as const;

export default function ModulesPage() {
  const reduce = useReducedMotion();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--background)]">
      <MinimalHeader />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-12 md:px-8 md:py-16">
        <div className="mb-10 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
            Modules
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Select a business area. Each module opens a focused workspace with
            its own navigation and tools.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {modules.map((m, i) => (
            <motion.li
              key={m.href}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={reduce ? false : { opacity: 1, y: 0 }}
              transition={{
                delay: reduce ? 0 : 0.05 * i,
                duration: 0.24,
                ease: [0.22, 1, 0.36, 1] as const,
              }}
            >
              <Link href={m.href} className="group block h-full">
                <Card className="h-full transition-[box-shadow,transform,border-color] duration-200 ease-out hover:border-[var(--foreground)]/15 hover:shadow-[var(--shadow-elevated)]">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <m.icon className="h-4 w-4 text-[var(--muted-foreground)]" />
                        <CardTitle className="text-base font-medium">
                          {m.title}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-sm leading-relaxed">
                        {m.description}
                      </CardDescription>
                    </div>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </CardHeader>
                </Card>
              </Link>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
