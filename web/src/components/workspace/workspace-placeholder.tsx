"use client";

import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlaceholderProps = {
  title: string;
  description?: string;
};

export function WorkspacePlaceholder({ title, description }: PlaceholderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] as const }}
    >
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
            {description ??
              "This workspace is scaffolded for the next implementation phase. Navigation, layout, and permissions are wired; data views will connect to the Remarkable API here."}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
