import { RouterProvider } from "react-router-dom";
import { ToastProvider } from "@/components/ui/Toast";
import { router } from "@/app/router";

/** Root provider chain: ToastProvider wrapping the RouterProvider (BoMeProvider mounts inside RootLayout, after the auth gate). */
export function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
