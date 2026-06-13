import { formatLedgerIndexLabel } from "@/lib/ledger-index";
import type { PaymentMethodCorrectionTarget } from "@/components/ops/payment-method-correction-dialog";
import type { ServicePaymentMethod } from "@/components/ops/service-payment-method-select";
import type { LedgerRow, ReconciliationWorkspaceRow } from "@/lib/api";
import type { LedgerTransaction } from "@/lib/ops-types";

function isServicePaymentMethod(raw: string | null | undefined): raw is ServicePaymentMethod {
  return raw === "cash" || raw === "transfer" || raw === "pos";
}

export function correctionTargetFromWorkspaceRow(
  row: ReconciliationWorkspaceRow,
): PaymentMethodCorrectionTarget | null {
  if (row.comparison_status !== "matched" || !row.manager_entry_id) return null;
  const method = row.manager?.payment_method ?? row.payment_method;
  if (!isServicePaymentMethod(method)) return null;
  return {
    entryId: row.manager_entry_id,
    indexLabel: formatLedgerIndexLabel(
      "service",
      row.index,
      row.index_label,
      row.financial_year,
      row.financial_month,
    ),
    serviceName: row.service_name,
    amount: Number(row.manager_amount ?? row.amount ?? 0),
    currentMethod: method,
    adjustments: row.payment_method_adjustments,
  };
}

export function correctionTargetFromLedgerTransaction(
  row: LedgerTransaction,
): PaymentMethodCorrectionTarget | null {
  if (row.comparisonStatus !== "matched" || row.type !== "service") return null;
  if (!isServicePaymentMethod(row.paymentMethod)) return null;
  return {
    entryId: row.id,
    indexLabel: formatLedgerIndexLabel("service", row.index, row.indexLabel),
    serviceName: row.serviceType ?? "Service",
    amount: row.amount,
    currentMethod: row.paymentMethod,
    adjustments: row.paymentMethodAdjustments,
  };
}

export function correctionTargetFromLedgerRow(
  row: LedgerRow,
): PaymentMethodCorrectionTarget | null {
  if (row.comparison_status !== "matched" || row.entry_type !== "service") return null;
  if (!isServicePaymentMethod(row.payment_method)) return null;
  return {
    entryId: row.id,
    indexLabel: formatLedgerIndexLabel(
      row.entry_type,
      row.barber_sequence_index,
      row.index_label,
    ),
    serviceName: row.service_type?.name ?? "Service",
    amount: Number(row.amount),
    currentMethod: row.payment_method,
    adjustments: row.payment_method_adjustments,
  };
}
