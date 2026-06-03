import { Outlet, createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/app/layouts/RootLayout";
import { HealthGate } from "@/app/HealthGate";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { RoleRoute } from "@/app/RoleRoute";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ClientsPage } from "@/pages/ClientsPage";
import { AccountsPage } from "@/pages/AccountsPage";
import { StaffManagementPage } from "@/pages/StaffManagementPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { FraudAlertsPage } from "@/pages/FraudAlertsPage";
import { MlConfigPage } from "@/pages/MlConfigPage";
import { AuditLogPage } from "@/pages/AuditLogPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { MaintenancePage } from "@/pages/MaintenancePage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";

/**
 * Wraps every route in <HealthGate> so backend outages flip the whole app
 * to /maintenance regardless of which page the user landed on.
 */
function RootShell() {
  return (
    <HealthGate>
      <Outlet />
    </HealthGate>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootShell />,
    children: [
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/maintenance", element: <MaintenancePage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <RootLayout />,
            children: [
              // Open to all signed-in BO roles
              { path: "/dashboard", element: <DashboardPage /> },
              { path: "/profile", element: <ProfilePage /> },

              // Admin + SuperAdmin
              {
                element: <RoleRoute allow={["ADMIN", "SUPERADMIN"]} />,
                children: [
                  { path: "/clients", element: <ClientsPage /> },
                  { path: "/accounts", element: <AccountsPage /> },
                ],
              },

              // Analyst + SuperAdmin
              {
                element: <RoleRoute allow={["ANALYST", "SUPERADMIN"]} />,
                children: [
                  { path: "/fraud-alerts", element: <FraudAlertsPage /> },
                  { path: "/ml-config", element: <MlConfigPage /> },
                ],
              },

              // All three
              {
                element: <RoleRoute allow={["ADMIN", "ANALYST", "SUPERADMIN"]} />,
                children: [
                  { path: "/transactions", element: <TransactionsPage /> },
                ],
              },

              // SuperAdmin only
              {
                element: <RoleRoute allow={["SUPERADMIN"]} />,
                children: [
                  { path: "/staff-management", element: <StaffManagementPage /> },
                  { path: "/audit-log", element: <AuditLogPage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
