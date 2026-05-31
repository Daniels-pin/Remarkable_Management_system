"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  getAttendanceSettings,
  updateAttendanceSettings,
  type AttendanceSettingsRow,
} from "@/lib/api";
import {
  formatLateTime,
  previewRadiusMeters,
  RADIUS_MAX_METERS,
  RADIUS_MIN_METERS,
  RADIUS_QUICK_PRESETS,
  sanitizeRadiusInput,
  validateRadiusMeters,
} from "@/lib/attendance";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";

const AttendanceMapPicker = dynamic(
  () => import("@/components/ops/attendance-map-picker").then((m) => m.AttendanceMapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--muted)]/20 text-sm text-[var(--muted-foreground)]">
        Loading map…
      </div>
    ),
  },
);

type GeocodeResult = { lat: number; lon: number; display_name: string };

async function searchLocation(query: string): Promise<GeocodeResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!data.length) return null;
  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    display_name: data[0].display_name,
  };
}

export function AttendanceSettingsPanel() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [canEdit, setCanEdit] = React.useState(false);
  const [radiusInput, setRadiusInput] = React.useState("100");
  const [radiusError, setRadiusError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    latitude: 6.5244,
    longitude: 3.3792,
    location_label: "Remarkable Barbershop",
    radius_meters: 100,
    late_time: "09:00",
    late_deduction_amount: "500",
    absence_deduction_amount: "2000",
  });

  const mapRadiusMeters = previewRadiusMeters(radiusInput, form.radius_meters);
  const displayRadiusMeters = mapRadiusMeters;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAttendanceSettings();
      const s = res.settings;
      setCanEdit(Boolean(s.can_edit));
      setRadiusInput(String(s.radius_meters));
      setRadiusError(null);
      setForm({
        latitude: Number(s.latitude),
        longitude: Number(s.longitude),
        location_label: s.location_label,
        radius_meters: s.radius_meters,
        late_time: s.late_time,
        late_deduction_amount: s.late_deduction_amount,
        absence_deduction_amount: s.absence_deduction_amount,
      });
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load attendance settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const runSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const hit = await searchLocation(searchQuery.trim());
      if (!hit) {
        toast.error("No location found for that search.");
        return;
      }
      setForm((f) => ({
        ...f,
        latitude: hit.lat,
        longitude: hit.lon,
        location_label: hit.display_name,
      }));
    } catch {
      toast.error("Location search failed.");
    } finally {
      setSearching(false);
    }
  };

  const applyRadiusInput = (raw: string) => {
    const digits = sanitizeRadiusInput(raw);
    setRadiusInput(digits);
    const parsed = digits ? Number.parseInt(digits, 10) : null;
    if (parsed != null && parsed > 0) {
      setForm((f) => ({ ...f, radius_meters: parsed }));
      setRadiusError(validateRadiusMeters(parsed));
    } else {
      setRadiusError("Enter a whole number of meters.");
    }
  };

  const save = async () => {
    const parsed = previewRadiusMeters(radiusInput, form.radius_meters);
    const radiusValidation = validateRadiusMeters(parsed);
    if (radiusValidation) {
      setRadiusError(radiusValidation);
      toast.error(radiusValidation);
      return;
    }

    setSaving(true);
    try {
      await updateAttendanceSettings({
        latitude: form.latitude,
        longitude: form.longitude,
        location_label: form.location_label.trim(),
        radius_meters: parsed,
        late_time: form.late_time,
        late_deduction_amount: Number(form.late_deduction_amount),
        absence_deduction_amount: Number(form.absence_deduction_amount),
      });
      toast.success("Attendance settings saved.");
      await load();
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm text-[var(--muted-foreground)]">Loading attendance settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card className="border-[var(--border)] shadow-[var(--shadow-card)]">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-[var(--muted)]/60 p-2">
              <MapPin className="h-4 w-4 text-[var(--foreground)]" />
            </div>
            <div>
              <h3 className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
                Shop attendance location
              </h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Set the official sign-in point, search an address, pin on the map, or enter coordinates
                manually. The radius circle updates live as you adjust it.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              disabled={!canEdit}
              placeholder="Search address or place name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void runSearch();
              }}
            />
            <Button
              disabled={!canEdit || searching}
              type="button"
              variant="outline"
              className="shrink-0 rounded-full"
              onClick={() => void runSearch()}
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>

          <AttendanceMapPicker
            latitude={form.latitude}
            longitude={form.longitude}
            locationLabel={form.location_label}
            radiusMeters={mapRadiusMeters}
            readOnly={!canEdit}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                latitude: v.latitude,
                longitude: v.longitude,
                location_label: v.locationLabel,
              }))
            }
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lat">Latitude</Label>
              <Input
                disabled={!canEdit}
                id="lat"
                inputMode="decimal"
                value={String(form.latitude)}
                onChange={(e) => setForm((f) => ({ ...f, latitude: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lng">Longitude</Label>
              <Input
                disabled={!canEdit}
                id="lng"
                inputMode="decimal"
                value={String(form.longitude)}
                onChange={(e) => setForm((f) => ({ ...f, longitude: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="label">Location label</Label>
              <Input
                disabled={!canEdit}
                id="label"
                value={form.location_label}
                onChange={(e) => setForm((f) => ({ ...f, location_label: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Attendance radius</p>
              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                <span className="font-medium text-[var(--foreground)]">
                  {displayRadiusMeters} meters
                </span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="radius-meters">Radius (meters)</Label>
              <Input
                aria-invalid={radiusError != null}
                className="max-w-[12rem]"
                disabled={!canEdit}
                id="radius-meters"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 125"
                value={radiusInput}
                onChange={(e) => applyRadiusInput(e.target.value)}
              />
              {radiusError ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{radiusError}</p>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">
                  {RADIUS_MIN_METERS}–{RADIUS_MAX_METERS} meters
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-[var(--muted-foreground)]">Quick select</span>
              {RADIUS_QUICK_PRESETS.map((r) => (
                <Button
                  key={r}
                  disabled={!canEdit}
                  size="sm"
                  type="button"
                  variant="outline"
                  className={cn(
                    "rounded-full",
                    radiusInput === String(r) &&
                      "border-transparent bg-[var(--foreground)] text-[var(--background)]",
                  )}
                  onClick={() => applyRadiusInput(String(r))}
                >
                  {r}m
                </Button>
              ))}
            </div>
            <p className="text-xs text-[var(--muted-foreground)]">
              Employees must sign in within {displayRadiusMeters} meters of the shop pin.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--border)] shadow-[var(--shadow-card)]">
        <CardContent className="space-y-5 p-5 md:p-6">
          <div>
            <h3 className="font-[family-name:var(--font-serif)] text-lg font-medium text-[var(--foreground)]">
              Discipline rules
            </h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Late and absence deductions apply automatically and reduce payroll in real time.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="late-time">Late time</Label>
              <Input
                disabled={!canEdit}
                id="late-time"
                type="time"
                value={form.late_time}
                onChange={(e) => setForm((f) => ({ ...f, late_time: e.target.value }))}
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                After {formatLateTime(form.late_time)} counts as late.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="late-deduction">Late deduction (₦)</Label>
              <Input
                disabled={!canEdit}
                id="late-deduction"
                inputMode="numeric"
                value={form.late_deduction_amount}
                onChange={(e) => setForm((f) => ({ ...f, late_deduction_amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="absence-deduction">Absence deduction (₦)</Label>
              <Input
                disabled={!canEdit}
                id="absence-deduction"
                inputMode="numeric"
                value={form.absence_deduction_amount}
                onChange={(e) =>
                  setForm((f) => ({ ...f, absence_deduction_amount: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--muted)]/20 px-4 py-3 text-sm text-[var(--muted-foreground)]">
            Preview: Late penalty {formatNaira(Number(form.late_deduction_amount) || 0)} · Absence
            penalty {formatNaira(Number(form.absence_deduction_amount) || 0)} · Sundays are globally
            off.
          </div>

          {canEdit ? (
            <Button
              className="rounded-full bg-[var(--foreground)] text-[var(--background)]"
              disabled={saving}
              type="button"
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save attendance settings"}
            </Button>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              Only admins can edit attendance configuration.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
