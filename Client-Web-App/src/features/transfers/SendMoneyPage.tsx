import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { ProfilePanel } from "@/components/layout/ProfilePanel";
import { useMe, deriveInitials } from "@/features/me/MeProvider";
import { TransferModeToggle } from "@/features/transfers/components/TransferModeToggle";
import { SendToSomeoneFlow } from "@/features/transfers/SendToSomeoneFlow";
import { InternalTransferPage } from "@/features/transfers/InternalTransferPage";
import type { TransferMode } from "@/features/transfers/components/TransferModeToggle";

interface SendMoneyPageProps {
  mode: TransferMode;
}

/**
 * "Send money" route shell — owns the TopBar, the mode toggle, and the
 * profile panel; mode determines whether the body renders the 4-step
 * send-to-someone flow or the single-page internal transfer.
 */
export function SendMoneyPage({ mode }: SendMoneyPageProps) {
  const { me } = useMe();
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const initials = deriveInitials(me);

  return (
    <div className="flex h-dvh w-screen flex-col overflow-hidden bg-surface-soft">
      <TopBar
        variant="light"
        pageName="Send money"
        me={me ? { initials, trustScore: me.trustScore, profilePictureUrl: me.profilePictureUrl } : null}
        onAvatarClick={() => setProfilePanelOpen(true)}
      />

      <ProfilePanel
        open={profilePanelOpen}
        onClose={() => setProfilePanelOpen(false)}
        me={me}
      />

      <main className="flex flex-1 flex-col overflow-y-auto px-4 py-3 sm:px-8 sm:py-4 lg:overflow-hidden">
        <div className="mx-auto flex w-full max-w-[1376px] flex-1 flex-col gap-3 lg:min-h-0">
          <TransferModeToggle mode={mode} />

          {mode === "send-to-someone" ? (
            <SendToSomeoneFlow />
          ) : (
            <InternalTransferPage />
          )}
        </div>
      </main>
    </div>
  );
}
