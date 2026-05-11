"use client";

import * as React from "react";
import { toast } from "sonner";

import { BarbershopShell } from "@/components/layout/barbershop-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, getMe, patchMyProfile, type MeResponse } from "@/lib/api";

export default function ProfilePage() {
  const { session } = useAuth();
  const isBarber = session?.role === "barber";

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [me, setMe] = React.useState<MeResponse | null>(null);

  const [fullName, setFullName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [bankName, setBankName] = React.useState("");
  const [accountNumber, setAccountNumber] = React.useState("");
  const [accountName, setAccountName] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const m = await getMe();
      setMe(m);
      setFullName(m.profile?.full_name ?? "");
      setPhone(m.profile?.phone ?? "");
      setAddress(m.profile?.address ?? "");
      setBankName(m.profile?.bank_name ?? "");
      setAccountNumber(m.profile?.account_number ?? "");
      setAccountName(m.profile?.account_name ?? "");
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load profile.");
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const completion = React.useMemo(() => {
    const fields = [
      fullName.trim(),
      phone.trim(),
      bankName.trim(),
      accountNumber.trim(),
      accountName.trim(),
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [fullName, phone, bankName, accountNumber, accountName]);

  const submit = async () => {
    setSaving(true);
    try {
      await patchMyProfile({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        bank_name: bankName.trim() || null,
        account_number: accountNumber.trim() || null,
        account_name: accountName.trim() || null,
      });
      toast.success("Profile updated.");
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not update profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BarbershopShell
      title="Profile"
      subtitle={
        isBarber
          ? "Personal, banking, and performance context."
          : "Account overview and directory access."
      }
    >
      {loading ? (
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Loading profile…</p>
        </div>
      ) : !me ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-[var(--muted-foreground)]">Profile is unavailable right now.</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Personal details</CardTitle>
              <CardDescription>
                Completion: {completion}%{isBarber ? " · used for payouts" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pf-name">Full name</Label>
                <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-phone">Phone</Label>
                <Input id="pf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-address">Address</Label>
                <Input id="pf-address" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <Button
                type="button"
                className="w-full rounded-full bg-[var(--foreground)] text-[var(--background)]"
                disabled={saving}
                onClick={() => void submit()}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bank details</CardTitle>
              <CardDescription>
                Used for commission payouts. Keep this accurate and up to date.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pf-bank">Bank name</Label>
                <Input id="pf-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-acct">Account number</Label>
                <Input
                  id="pf-acct"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-acctname">Account name</Label>
                <Input
                  id="pf-acctname"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/35 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                Signed in as <span className="text-[var(--foreground)]">{me.role}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </BarbershopShell>
  );
}
