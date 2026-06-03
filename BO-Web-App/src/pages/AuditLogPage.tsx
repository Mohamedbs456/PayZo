import { useMemo } from "react";
import { session } from "@/lib/auth/session";
import { useAuditLog } from "@/features/audit/hooks";
import { AuditLogTable } from "@/features/audit/components/AuditLogTable";
import type { AuditScope } from "@/features/audit/api";

/**
 * Audit log — append-only record of every recorded backoffice action.
 *
 * Scope resolution by role:
 *  - SuperAdmin : system-wide feed via {@code /superadmin/audit-log} —
 *    admin client acceptances, analyst threshold reports, SA actions, etc.
 *  - Admin      : own decision history ({@code /admin/decisions/history}).
 *  - Analyst    : own fraud-alert decisions ({@code /analyst/decisions/history}).
 */
export function AuditLogPage() {
  const roles = session.get()?.roles ?? [];
  const scope = useMemo<AuditScope>(() => {
    if (roles.includes("SUPERADMIN")) return "SUPERADMIN";
    if (roles.includes("ANALYST")) return "ANALYST";
    return "ADMIN";
  }, [roles]);

  const { items, totalElements, loadingInitial, loadingMore, hasMore, error, loadMore } =
    useAuditLog(scope);

  const subtitle =
    scope === "SUPERADMIN"
      ? "All recorded actions across roles"
      : scope === "ANALYST"
        ? "Your fraud-alert decisions"
        : "Your decisions";

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 p-5 overflow-x-clip">
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="font-sans text-[14px] font-bold text-text-primary">
          Audit log
        </span>
        <span className="font-sans text-[12px] text-text-muted">
          {totalElements.toLocaleString()}{" "}
          {totalElements === 1 ? "event" : "events"} · {subtitle}
        </span>
      </div>

      <AuditLogTable
        items={items}
        loadingInitial={loadingInitial}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        onLoadMore={loadMore}
      />
    </div>
  );
}
