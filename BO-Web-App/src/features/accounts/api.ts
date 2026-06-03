import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";
import type { ClientListItem } from "@/features/clients/api";

/**
 * Accounts page reuses the Clients-page list contract — same DTO, same
 * /admin/clients endpoint, just adds the optional `bank` filter. Keeping
 * the row shape identical lets us share the avatar / status / formatters
 * with the Clients feature instead of re-defining them.
 */

export interface FetchClientsForAccountsParams {
  bank?: string | null;
  q?: string;
  page?: number;
  size?: number;
  signal?: AbortSignal;
}

export function fetchClientsForAccounts(
  params: FetchClientsForAccountsParams,
): Promise<PagedResponse<ClientListItem>> {
  return api.get<PagedResponse<ClientListItem>>("/admin/clients", {
    query: {
      bank: params.bank?.trim() || undefined,
      q: params.q?.trim() || undefined,
      page: params.page ?? 0,
      size: params.size ?? 10,
    },
    signal: params.signal,
  });
}

/* ─── CBS accounts (lazy on row expand) ───────────────────────────────── */

export interface CbsAccountRow {
  accountNumber: string;
  bankCode: string;
  /** "CHECKING" or "SAVINGS". */
  type: string;
  /** Decimal as string (BigDecimal serialisation) — keep as string to preserve precision. */
  balance: string;
}

export function fetchCbsAccounts(
  userId: string,
  signal?: AbortSignal,
): Promise<CbsAccountRow[]> {
  return api.get<CbsAccountRow[]>(`/admin/clients/${userId}/cbs-accounts`, {
    signal,
  });
}
