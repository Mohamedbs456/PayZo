import type { ClientListItem, ClientStatus, ClientStatusFilter } from "./api";

/**
 * Derived display states for the Clients page. Mirrors the 5 backend
 * statuses + ACCEPTED, where ACCEPTED is *not* a real DB status — it's the
 * UX label for "admin approved this client but they haven't done their first
 * login yet" (status IN (ACTIVE, BLOCKED) with firstLoginCompleted=false).
 */
export type DisplayStatus = ClientStatus;

/**
 * Map a row to its lifecycle display state. ACTIVE / BLOCKED rows whose
 * firstLogin is still pending collapse to the "ACCEPTED" UX label so the
 * user can spot fresh-from-approval clients at a glance.
 */
export function effectiveStatus(c: ClientListItem): DisplayStatus {
  if (
    !c.firstLoginCompleted &&
    (c.status === "ACTIVE" || c.status === "BLOCKED")
  ) {
    return "ACCEPTED";
  }
  return c.status;
}

/**
 * What the row's status pill should display under the active tab. Per spec,
 * the ACCEPTED-derived label only surfaces in the All tab — every other tab
 * shows the row's actual operating status (ACTIVE / BLOCKED / …) so the
 * user isn't confused by seeing ACCEPTED inside the Accepted tab itself.
 */
export function pillStatusFor(
  c: ClientListItem,
  tab: ClientStatusFilter,
): DisplayStatus {
  if (tab === null) {
    return effectiveStatus(c);
  }
  return c.status;
}
