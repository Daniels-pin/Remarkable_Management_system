import { toast } from "sonner";

import { ApiError, isSessionAuthError } from "@/lib/api";

/** Show a toast for API failures; session/auth errors are handled globally. */
export function handleApiError(error: unknown, fallback: string) {
  if (isSessionAuthError(error)) return;
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }
  toast.error(fallback);
}
