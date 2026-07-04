"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { FinancialMonthStatusPill } from "@/components/ops/financial-month-status-pill";
import { SummaryMetricCard } from "@/components/ops/summary-metric-card";
import {
  ApiError,
  getCommissionPayroll,
  listFinancialMonths,
  type CommissionPayrollRow,
  type CommissionPayrollWaiverRow,
  type FinancialMonthRow,
  type SalaryPayrollRow,
} from "@/lib/api";
import { monthLabel } from "@/lib/financial-month";
import { formatNaira } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PayrollView = "commission" | "salary";

function statusTone(status: string): string {
  if (status === "paid") return "text-emerald-700 dark:text-emerald-300";
  if (status === "approved") return "text-emerald-700 dark:text-emerald-300";
  if (status === "pending" || status === "mismatch") return "text-amber-800 dark:text-amber-200";
  if (status === "unpaid") return "text-rose-700 dark:text-rose-300";
  return "text-[var(--muted-foreground)]";
}

function WaiverList({ waivers }: { waivers?: CommissionPayrollWaiverRow[] }) {
  if (!waivers?.length) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border)]/80 bg-[var(--muted)]/10 px-3 py-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        Attendance waivers
      </p>
      <ul className="mt-2 space-y-2">
        {waivers.map((w) => (
          <li key={w.id} className="text-xs">
            <p className="font-medium text-[var(--foreground)]">
              {new Date(w.business_date).toLocaleDateString("en-NG")} ·{" "}
              {w.deduction_reason ?? "penalty"}
            </p>
            <p className="mt-0.5 text-[var(--muted-foreground)]">{w.waiver_reason}</p>
            {Number(w.original_deduction_amount) > 0 ? (
              <p className="mt-0.5 tabular-nums text-emerald-700 dark:text-emerald-300">
                Waived {formatNaira(Number(w.original_deduction_amount))}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommissionDetailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: CommissionPayrollRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;

  const pct = Number(row.commission_pct) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,32rem)]">
        <DialogHeader>
          <DialogTitle>{row.display_name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <dl className="grid gap-3 text-sm">
            <DetailRow label="Approved revenue" value={formatNaira(Number(row.approved_revenue))} />
            <DetailRow
              label="Matched service total"
              value={formatNaira(Number(row.matched_service_total))}
            />
            <DetailRow label="Commission %" value={`${pct}%`} />
            <DetailRow
              label="Expected commission"
              value={formatNaira(Number(row.expected_commission))}
            />
            <DetailRow label="Late deductions" value={formatNaira(Number(row.late_deductions))} />
            <DetailRow
              label="Absence deductions"
              value={formatNaira(Number(row.absence_deductions))}
            />
            {Number(row.team_advances) > 0 ? (
              <DetailRow label="Team advances" value={formatNaira(Number(row.team_advances))} />
            ) : null}
            {Number(row.other_deductions) > 0 ? (
              <DetailRow
                label="Other approved deductions"
                value={formatNaira(Number(row.other_deductions))}
              />
            ) : null}
            <DetailRow
              label="Final commission"
              value={formatNaira(Number(row.final_commission_payable))}
              strong
            />
          </dl>
          <WaiverList waivers={row.attendance_waivers} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function SalaryDetailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: SalaryPayrollRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(100%,32rem)]">
        <DialogHeader>
          <DialogTitle>{row.display_name}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <dl className="grid gap-3 text-sm">
            <DetailRow label="Monthly salary" value={formatNaira(Number(row.monthly_salary))} />
            <DetailRow label="Late deductions" value={formatNaira(Number(row.late_deductions))} />
            <DetailRow
              label="Absence deductions"
              value={formatNaira(Number(row.absence_deductions))}
            />
            {Number(row.team_advances) > 0 ? (
              <DetailRow label="Team advances" value={formatNaira(Number(row.team_advances))} />
            ) : null}
            {Number(row.other_deductions) > 0 ? (
              <DetailRow
                label="Other approved deductions"
                value={formatNaira(Number(row.other_deductions))}
              />
            ) : null}
            <DetailRow
              label="Final salary payable"
              value={formatNaira(Number(row.final_salary_payable))}
              strong
            />
            <DetailRow label="Approval status" value={row.status} />
          </dl>
          <WaiverList waivers={row.attendance_waivers} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)]/70 pb-2 last:border-0">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd
        className={cn(
          "tabular-nums text-[var(--foreground)]",
          strong && "text-base font-semibold text-emerald-700 dark:text-emerald-300",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function DeductionCell({ amount }: { amount: string }) {
  return (
    <td className="px-4 py-3 text-right tabular-nums text-amber-800 dark:text-amber-200">
      {Number(amount) > 0 ? formatNaira(Number(amount)) : "—"}
    </td>
  );
}

export function CommissionPayrollPanel({ embedded = false }: { embedded?: boolean }) {
  const searchParams = useSearchParams();
  const now = React.useMemo(() => new Date(), []);
  const initialYear = Number(searchParams.get("year")) || now.getFullYear();
  const initialMonth = Number(searchParams.get("month")) || now.getMonth() + 1;
  const [months, setMonths] = React.useState<FinancialMonthRow[]>([]);
  const [selectedYear, setSelectedYear] = React.useState(initialYear);
  const [selectedMonth, setSelectedMonth] = React.useState(initialMonth);
  const [view, setView] = React.useState<PayrollView>("commission");
  const [commissionRows, setCommissionRows] = React.useState<CommissionPayrollRow[]>([]);
  const [salaryRows, setSalaryRows] = React.useState<SalaryPayrollRow[]>([]);
  const [commissionTotal, setCommissionTotal] = React.useState(0);
  const [salaryTotal, setSalaryTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [commissionDetail, setCommissionDetail] = React.useState<CommissionPayrollRow | null>(null);
  const [salaryDetail, setSalaryDetail] = React.useState<SalaryPayrollRow | null>(null);
  const [commissionDetailOpen, setCommissionDetailOpen] = React.useState(false);
  const [salaryDetailOpen, setSalaryDetailOpen] = React.useState(false);

  const selectedArchive = React.useMemo(
    () => months.find((m) => m.year === selectedYear && m.month === selectedMonth) ?? null,
    [months, selectedYear, selectedMonth],
  );

  React.useEffect(() => {
    listFinancialMonths()
      .then((res) => setMonths(res.items))
      .catch(() => setMonths([]));
  }, []);

  const loadPayroll = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCommissionPayroll(selectedYear, selectedMonth);
      setCommissionRows(res.items);
      setSalaryRows(res.salary_items ?? []);
      setCommissionTotal(Number(res.commission_total) || 0);
      setSalaryTotal(Number(res.salary_total) || 0);
    } catch (e) {
      if (e instanceof ApiError) toast.error(e.message);
      else toast.error("Could not load payroll.");
      setCommissionRows([]);
      setSalaryRows([]);
      setCommissionTotal(0);
      setSalaryTotal(0);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  React.useEffect(() => {
    queueMicrotask(() => void loadPayroll());
  }, [loadPayroll]);

  const tableTitle =
    view === "commission"
      ? `Commission earners · ${monthLabel(selectedYear, selectedMonth)}`
      : `Salary earners · ${monthLabel(selectedYear, selectedMonth)}`;

  return (
    <div className={cn("space-y-8", embedded && "space-y-6")}>
      {!embedded ? (
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/barbershop/finance"
              className={buttonVariants({ variant: "outline", size: "sm", className: "rounded-full" })}
            >
              ← Finance
            </Link>
          </div>
          <h2 className="font-[family-name:var(--font-serif)] text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
            Payroll center
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
            Month-end commission and salary obligations with attendance deductions and final payable
            amounts — read from existing financial records.
          </p>
        </header>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            Pay period
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={`${selectedYear}-${selectedMonth}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setSelectedYear(y);
                setSelectedMonth(m);
              }}
              className="h-10 min-w-[12rem] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] shadow-[var(--shadow-card)]"
            >
              {months.length > 0
                ? months.map((m) => (
                    <option key={m.id} value={`${m.year}-${m.month}`}>
                      {monthLabel(m.year, m.month)}
                      {m.is_current ? " · Current" : ""}
                    </option>
                  ))
                : (
                  <option value={`${selectedYear}-${selectedMonth}`}>
                    {monthLabel(selectedYear, selectedMonth)}
                  </option>
                )}
            </select>
            {selectedArchive ? <FinancialMonthStatusPill state={selectedArchive.state} /> : null}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => void loadPayroll()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryMetricCard
          label="Commission total"
          value={formatNaira(commissionTotal)}
          hint="Sum of final commission payable"
          className="h-full"
          active={view === "commission"}
          onClick={() => setView("commission")}
        />
        <SummaryMetricCard
          label="Salary total"
          value={formatNaira(salaryTotal)}
          hint="Sum of final salary payable"
          className="h-full"
          active={view === "salary"}
          onClick={() => setView("salary")}
        />
      </div>

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            {tableTitle}
          </p>
        </div>
        {loading ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
            Loading payroll…
          </div>
        ) : view === "commission" ? (
          commissionRows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
              No commission earners for this month.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                    <th className="px-4 py-3 font-medium">Employee</th>
                    <th className="px-4 py-3 font-medium text-right">Approved revenue</th>
                    <th className="px-4 py-3 font-medium text-right">Commission %</th>
                    <th className="px-4 py-3 font-medium text-right">Expected</th>
                    <th className="px-4 py-3 font-medium text-right">Late</th>
                    <th className="px-4 py-3 font-medium text-right">Absence</th>
                    <th className="px-4 py-3 font-medium text-right">Advances</th>
                    <th className="px-4 py-3 font-medium text-right">Other</th>
                    <th className="px-4 py-3 font-medium text-right">Final payable</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {commissionRows.map((row) => (
                    <tr
                      key={row.user_id}
                      className="cursor-pointer transition-colors hover:bg-[var(--muted)]/20"
                      onClick={() => {
                        setCommissionDetail(row);
                        setCommissionDetailOpen(true);
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                        {row.display_name}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNaira(Number(row.approved_revenue))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {Number(row.commission_pct)}%
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNaira(Number(row.expected_commission))}
                      </td>
                      <DeductionCell amount={row.late_deductions} />
                      <DeductionCell amount={row.absence_deductions} />
                      <DeductionCell amount={row.team_advances} />
                      <DeductionCell amount={row.other_deductions} />
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatNaira(Number(row.final_commission_payable))}
                      </td>
                      <td className={cn("px-4 py-3 capitalize", statusTone(row.payout_state))}>
                        {row.payout_state === "paid" ? "Paid" : row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : salaryRows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-[var(--muted-foreground)]">
            No salary earners for this month.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium text-right">Monthly salary</th>
                  <th className="px-4 py-3 font-medium text-right">Late</th>
                  <th className="px-4 py-3 font-medium text-right">Absence</th>
                  <th className="px-4 py-3 font-medium text-right">Advances</th>
                  <th className="px-4 py-3 font-medium text-right">Other</th>
                  <th className="px-4 py-3 font-medium text-right">Final payable</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {salaryRows.map((row) => (
                  <tr
                    key={row.user_id}
                    className="cursor-pointer transition-colors hover:bg-[var(--muted)]/20"
                    onClick={() => {
                      setSalaryDetail(row);
                      setSalaryDetailOpen(true);
                    }}
                  >
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                      {row.display_name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNaira(Number(row.monthly_salary))}
                    </td>
                    <DeductionCell amount={row.late_deductions} />
                    <DeductionCell amount={row.absence_deductions} />
                    <DeductionCell amount={row.team_advances} />
                    <DeductionCell amount={row.other_deductions} />
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                      {formatNaira(Number(row.final_salary_payable))}
                    </td>
                    <td className={cn("px-4 py-3 capitalize", statusTone(row.status))}>
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CommissionDetailDialog
        row={commissionDetail}
        open={commissionDetailOpen}
        onOpenChange={setCommissionDetailOpen}
      />
      <SalaryDetailDialog
        row={salaryDetail}
        open={salaryDetailOpen}
        onOpenChange={setSalaryDetailOpen}
      />
    </div>
  );
}
