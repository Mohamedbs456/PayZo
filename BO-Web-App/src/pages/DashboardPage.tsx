import { useEffect, useRef } from "react";
import { primaryRole } from "@/lib/auth/session";
import { SuperAdminDashboard } from "@/features/dashboard/SuperAdminDashboard";
import { AdminDashboard } from "@/features/dashboard/AdminDashboard";
import { AnalystDashboard } from "@/features/dashboard/AnalystDashboard";
import { useBoMe } from "@/features/me/BoMeProvider";
import { useChangePasswordModal } from "@/features/me/ChangePasswordModalProvider";

/**
 * Dashboard route — picks the right layout for the role.
 *
 * Side-effect: when /me reports `firstLoginCompleted=false` we auto-pop
 * the forced change-password modal. The flag flips server-side after a
 * successful first-login rotation, so this runs at most once per user.
 * We read /me from the BoMeProvider rather than fetching directly, so
 * the sidebar avatar and the dashboard share one cached payload.
 */
export function DashboardPage() {
  const role = primaryRole();
  const changePasswordModal = useChangePasswordModal();
  const { me } = useBoMe();
  const popped = useRef(false);

  useEffect(() => {
    if (!me) return;
    if (popped.current) return;
    if (!me.firstLoginCompleted) {
      popped.current = true;
      changePasswordModal.open({ forced: true });
    }
  }, [me, changePasswordModal]);

  if (role === "ADMIN") return <AdminDashboard />;
  if (role === "ANALYST") return <AnalystDashboard />;
  if (role === "SUPERADMIN") return <SuperAdminDashboard />;
  return null;
}
