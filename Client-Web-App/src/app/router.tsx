import { Outlet, createBrowserRouter, Navigate } from "react-router-dom";
import { HealthGate } from "@/app/HealthGate";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ClientOnlyRoute } from "@/app/RoleRoute";
import { LoginPage } from "@/features/auth/LoginPage";
import { LoginChooseChannelPage } from "@/features/auth/LoginChooseChannelPage";
import { LoginVerifyOtpPage } from "@/features/auth/LoginVerifyOtpPage";
import { SignupVerifyIdentityPage } from "@/features/auth/SignupVerifyIdentityPage";
import { SignupChooseChannelPage } from "@/features/auth/SignupChooseChannelPage";
import { SignupVerifyOtpPage } from "@/features/auth/SignupVerifyOtpPage";
import { SignupSubmittedPage } from "@/features/auth/SignupSubmittedPage";
import { ResetPasswordIdentifyPage } from "@/features/auth/ResetPasswordIdentifyPage";
import { ResetPasswordVerifyOtpPage } from "@/features/auth/ResetPasswordVerifyOtpPage";
import { ResetPasswordNewPasswordPage } from "@/features/auth/ResetPasswordNewPasswordPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { AccountsPage } from "@/features/accounts/AccountsPage";
import { SendMoneyPage } from "@/features/transfers/SendMoneyPage";
import { BeneficiariesPage } from "@/features/beneficiaries/BeneficiariesPage";
import { TransactionsPage } from "@/features/transactions/TransactionsPage";
import { AlertsPage } from "@/features/alerts/AlertsPage";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { MaintenancePage } from "@/pages/MaintenancePage";
import { NotFoundPage } from "@/pages/NotFoundPage";

/**
 * Wraps every route in <HealthGate> so backend outages flip the whole
 * app to /maintenance regardless of which page the user landed on.
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

      // ─── Public auth routes ───────────────────────────────────────
      // 1a — credentials screen (real, Figma 74:5)
      { path: "/login", element: <LoginPage /> },
      // 1a.2 — channel chooser (Step 2 of 2 — pick EMAIL or SMS)
      { path: "/login/channel", element: <LoginChooseChannelPage /> },
      // 1a.3 — OTP verify (improvised in the same style as 74:5)
      { path: "/login/verify", element: <LoginVerifyOtpPage /> },
      // 1b — sign-up flow (Figma 77:4 / 77:66 / 94:5 / 77:126)
      { path: "/signup", element: <SignupVerifyIdentityPage /> },
      { path: "/signup/channel", element: <SignupChooseChannelPage /> },
      { path: "/signup/verify", element: <SignupVerifyOtpPage /> },
      { path: "/signup/submitted", element: <SignupSubmittedPage /> },
      // 1c — forgot password (Figma 277:2 / 277:42 / 277:102)
      { path: "/forgot-password", element: <ResetPasswordIdentifyPage /> },
      { path: "/forgot-password/verify", element: <ResetPasswordVerifyOtpPage /> },
      { path: "/forgot-password/reset", element: <ResetPasswordNewPasswordPage /> },
      { path: "/maintenance", element: <MaintenancePage /> },

      // ─── Authenticated routes ─────────────────────────────────────
      // Each page renders its own TopBar + content, so there's no shared
      // layout wrapper here — the auth gates are the only nesting.
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <ClientOnlyRoute />,
            children: [
              { path: "/dashboard", element: <DashboardPage /> },
              { path: "/accounts", element: <AccountsPage /> },
              {
                path: "/transfers",
                element: <SendMoneyPage mode="send-to-someone" />,
              },
              {
                path: "/transfers/internal",
                element: <SendMoneyPage mode="between-accounts" />,
              },
              { path: "/beneficiaries", element: <BeneficiariesPage /> },
              { path: "/transactions", element: <TransactionsPage /> },
              { path: "/alerts", element: <AlertsPage /> },
              { path: "/notifications", element: <NotificationsPage /> },
            ],
          },
        ],
      },

      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
