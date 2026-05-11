"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { RequirePasswordChange } from "@/components/auth/guards";
import { RemarkableLogo } from "@/components/branding/remarkable-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError, changePassword } from "@/lib/api";

export default function SetPasswordPage() {
  const reduce = useReducedMotion();
  const router = useRouter();
  const { refresh } = useAuth();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(current, next);
      toast.success("Password updated");
      await refresh();
      router.replace("/modules");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error("Could not update password.");
      }
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
    <RequirePasswordChange>
      <motion.div className="w-full max-w-[22rem]" {...motionProps}>
        <div className="mb-10 flex flex-col items-center gap-5 text-center">
          <RemarkableLogo className="!h-24 !w-40" priority />
          <div className="space-y-1.5">
            <h1 className="text-lg font-medium tracking-tight text-[var(--foreground)]">
              Choose a new password
            </h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              Your administrator requires a password update before you
              continue.
            </p>
          </div>
        </div>
        <Card>
          <form onSubmit={(e) => void onSubmit(e)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium">
                Secure your account
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current">Current password</Label>
                <Input
                  id="current"
                  type="password"
                  autoComplete="current-password"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new">New password</Label>
                <Input
                  id="new"
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? "Saving…" : "Save and continue"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </RequirePasswordChange>
  );
}
