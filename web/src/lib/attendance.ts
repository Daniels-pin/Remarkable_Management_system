export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export const WEEKDAY_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const RADIUS_MIN_METERS = 10;
export const RADIUS_MAX_METERS = 1000;

/** Quick-select chips; autofill the radius input only (not stored as labels). */
export const RADIUS_QUICK_PRESETS = [50, 75, 100, 150] as const;

/** @deprecated Use RADIUS_QUICK_PRESETS */
export const RADIUS_PRESETS = RADIUS_QUICK_PRESETS;

export function sanitizeRadiusInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function parseRadiusMeters(raw: string): number | null {
  const digits = sanitizeRadiusInput(raw);
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function previewRadiusMeters(raw: string, fallback: number): number {
  const parsed = parseRadiusMeters(raw);
  return parsed ?? fallback;
}

export function validateRadiusMeters(value: number): string | null {
  if (!Number.isInteger(value) || value <= 0) {
    return "Enter a whole number of meters.";
  }
  if (value < RADIUS_MIN_METERS) {
    return `Minimum radius is ${RADIUS_MIN_METERS} meters.`;
  }
  if (value > RADIUS_MAX_METERS) {
    return `Maximum radius is ${RADIUS_MAX_METERS} meters.`;
  }
  return null;
}

export function attendanceStatusLabel(status: string | null | undefined): string {
  const normalized = (status ?? "").toLowerCase();
  switch (normalized) {
    case "on_time":
      return "On time";
    case "late":
      return "Late sign-in";
    case "absent":
      return "Absent";
    default:
      return "Not signed in";
  }
}

export function attendanceStatusTone(status: string | null | undefined): string {
  const normalized = (status ?? "").toLowerCase();
  switch (normalized) {
    case "on_time":
      return "text-emerald-700 dark:text-emerald-300";
    case "late":
      return "text-amber-800 dark:text-amber-200";
    case "absent":
      return "text-rose-700 dark:text-rose-300";
    default:
      return "text-[var(--muted-foreground)]";
  }
}

export function formatLateTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

/** Minutes late after cutoff; null if on time or cannot compute. */
export function latenessMinutes(signedInAt: string, lateTime: string): number | null {
  const signed = new Date(signedInAt);
  if (Number.isNaN(signed.getTime())) return null;
  const [h, m] = lateTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const cutoff = new Date(signed);
  cutoff.setHours(h, m, 0, 0);
  const diffMs = signed.getTime() - cutoff.getTime();
  if (diffMs <= 0) return null;
  return Math.round(diffMs / 60_000);
}

export function formatLatenessDuration(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function monthPickerOptions(count = 12): Array<{ year: number; month: number; label: string }> {
  const out: Array<{ year: number; month: number; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString("en-NG", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

/** Current calendar month in shop-local terms (Africa/Lagos by default in API). */
export function currentAttendanceMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

const EMPTY_SUMMARY = {
  late_deductions_total: "0",
  absence_deductions_total: "0",
  total_deductions: "0",
};

export function normalizeAttendanceSummary(
  summary: Partial<{
    late_deductions_total: string;
    absence_deductions_total: string;
    total_deductions: string;
  }> | null | undefined,
) {
  return {
    late_deductions_total: summary?.late_deductions_total ?? "0",
    absence_deductions_total: summary?.absence_deductions_total ?? "0",
    total_deductions: summary?.total_deductions ?? "0",
  };
}

export { EMPTY_SUMMARY as EMPTY_ATTENDANCE_SUMMARY };
