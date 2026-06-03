import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClientsToolbar } from "@/features/clients/components/ClientsToolbar";
import { ClientsTable } from "@/features/clients/components/ClientsTable";
import { RegisterClientDialog } from "@/features/clients/components/RegisterClientDialog";
import { useInfiniteClients } from "@/features/clients/hooks";
import { useEnterSearch } from "@/lib/hooks/useEnterSearch";
import type { ClientListItem, ClientStatus, ClientStatusFilter } from "@/features/clients/api";

/**
 * Unified clients list (D30). Visible to ADMIN, ANALYST, SUPERADMIN with
 * role-scoped actions per architecture.md §8.
 *
 * Layout:
 *   - Toolbar row: filter pills (All/Pending/Accepted/Active/Blocked/Rejected)
 *     + search + Register-client button.
 *   - Sub-header: "Showing: <tab> · <total> total clients".
 *   - Table card: sticky header + infinite-scroll body (page size 10).
 *
 * Scrolling: only the table body scrolls — the page chrome stays fixed per
 * RootLayout's "nothing scrolls" contract.
 */
export function ClientsPage() {
  // Drives both initial state (so a deep-link from the dashboard's
  // "Pending clients" card lands on the right tab) and ongoing UX —
  // each filter pill click syncs the URL so back/forward + refresh work.
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<ClientStatusFilter>(() =>
    parseStatusParam(searchParams.get("status")),
  );
  // Enter-to-search: typing alone doesn't refetch — the user explicitly
  // commits via Enter (or the X button to clear). Per the unified
  // backend-side search contract.
  const search = useEnterSearch();
  const [registerOpen, setRegisterOpen] = useState(false);

  // Keep `status` in sync with the URL when the user arrives via deep link
  // (dashboard card click) or hits Back/Forward.
  useEffect(() => {
    const fromUrl = parseStatusParam(searchParams.get("status"));
    if (fromUrl !== status) setStatus(fromUrl);
    // We only react to the URL — clicking a pill writes the URL via
    // handleStatusChange, so the dependency on `status` is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleStatusChange = (next: ClientStatusFilter) => {
    setStatus(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set("status", next);
    else params.delete("status");
    setSearchParams(params, { replace: true });
  };

  const {
    items,
    totalElements,
    loadingInitial,
    loadingMore,
    hasMore,
    error,
    loadMore,
    removeItem,
    updateItem,
    reload,
  } = useInfiniteClients({ status, q: search.committed });

  // After approve / reject / block / unblock the row's status is fresh —
  // decide whether it still belongs in the active tab. If yes, swap the row
  // in place; if no, drop it (the user will see the change after switching
  // tabs). Mirrors the backend filter contract in SubscriptionService.getClients.
  const handleClientUpdated = (updated: ClientListItem) => {
    if (rowMatchesTab(updated, status)) {
      updateItem(updated);
    } else {
      removeItem(updated.userId);
    }
  };

  const tabLabel = STATUS_LABEL[status === null ? "ALL" : status];

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden p-5">
      <ClientsToolbar
        status={status}
        onStatusChange={handleStatusChange}
        search={search.draft}
        onSearchChange={search.setDraft}
        onSearchSubmit={search.commit}
        onSearchClear={search.clear}
        onRegisterClick={() => setRegisterOpen(true)}
      />

      <div className="flex shrink-0 items-baseline gap-2">
        <span className="font-sans text-[12px] font-bold text-text-primary">
          Showing: {tabLabel}
        </span>
        <span className="font-sans text-[12px] text-text-muted">
          {totalElements.toLocaleString()} total clients
        </span>
      </div>

      <ClientsTable
        statusFilter={status}
        items={items}
        loadingInitial={loadingInitial}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        onLoadMore={loadMore}
        onDeleted={removeItem}
        onUpdated={handleClientUpdated}
      />

      <RegisterClientDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        // After a successful direct subscription the new ACTIVE+firstLogin=false
        // row needs to appear. Cheapest correct option: hard-reload the current
        // list — the new row lands at the top thanks to the createdAt-DESC sort.
        onSuccess={() => reload()}
      />
    </div>
  );
}

const STATUS_LABEL: Record<"ALL" | "PENDING" | "ACCEPTED" | "ACTIVE" | "BLOCKED" | "REJECTED", string> = {
  ALL:      "All clients",
  PENDING:  "Pending",
  ACCEPTED: "Accepted",
  ACTIVE:   "Active",
  BLOCKED:  "Blocked",
  REJECTED: "Rejected",
};

/**
 * Map a `?status=` URL value (case-insensitive) to a valid filter, or null
 * (the "All" tab) when missing/unrecognized. Lets the dashboard's "Pending
 * clients" card deep-link to /clients?status=PENDING and land directly
 * in the Pending tab.
 */
const STATUS_PARAM_VALUES: ClientStatus[] = [
  "PENDING",
  "ACCEPTED",
  "ACTIVE",
  "BLOCKED",
  "REJECTED",
];
function parseStatusParam(raw: string | null): ClientStatusFilter {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return (STATUS_PARAM_VALUES as string[]).includes(upper)
    ? (upper as ClientStatus)
    : null;
}

/**
 * FE mirror of the backend filter in SubscriptionService.getClients. Used to
 * decide whether a row should stay in the current tab after a status-change
 * action (approve/reject/block/unblock). Stays in sync with the backend —
 * if the contract there changes, update both.
 */
function rowMatchesTab(c: ClientListItem, tab: ClientStatusFilter): boolean {
  if (tab === null) return true;                                // All
  if (tab === "ACCEPTED") {
    // Approved-but-never-logged-in: admin accepted them, Keycloak account
    // exists, but they haven't completed first login yet. Mirrors the
    // backend filter in SubscriptionService.clientFilterSpec.
    return c.status === "ACTIVE" && !c.firstLoginCompleted;
  }
  if (tab === "ACTIVE") {
    // Strict "post-first-login" — fresh accepts (firstLogin=false) live
    // in the Accepted tab, not here.
    return c.status === "ACTIVE" && c.firstLoginCompleted;
  }
  return c.status === tab;                                      // PENDING / BLOCKED / REJECTED
}
