"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import * as React from "react";

import { RemarkableLogo } from "@/components/branding/remarkable-logo";
import { GuestGuard } from "@/components/auth/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import { getPostAuthPath } from "@/lib/routing";

export default function LoginPage() {
  const reduce = useReducedMotion();
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const session = await login(username, password);
      if (session.must_change_password) {
        router.replace("/set-password");
      } else {
        router.replace(getPostAuthPath(session.role));
      }
      router.refresh();
    } catch {
      /* toast handled in provider */
    } finally {
      setSubmitting(false);
    }
  }

  const motionProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <GuestGuard>
      <motion.div className="w-full max-w-[22rem]" {...motionProps}>
        <div className="mb-10 flex flex-col items-center gap-6 text-center">
          <RemarkableLogo className="!h-28 !w-44" priority />
          <div className="space-y-1.5">
            <h1 className="text-lg font-medium tracking-tight text-[var(--foreground)]">
              Sign in
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Remarkable internal operations
            </p>
          </div>
        </div>
        <Card>
          <form onSubmit={(e) => void onSubmit(e)}>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="username">Email or username</Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? "Signing in…" : "Continue"}
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                First-time access? Use the password provided by your admin,
                then choose Update password if you are required to rotate it.
              </p>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </GuestGuard>
  );
}
