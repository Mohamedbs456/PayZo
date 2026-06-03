import { useState, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Plus, Send, Users } from "lucide-react-native";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PasswordField } from "@/components/ui/PasswordField";
import { OtpInput } from "@/components/ui/OtpInput";
import { Chip } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { AuthCard } from "@/components/ui/AuthCard";
import { GradientHeader } from "@/components/ui/GradientHeader";
import { PayZoWordmark } from "@/components/ui/PayZoWordmark";
import { PayZoShield } from "@/components/ui/PayZoShield";
import { ConfirmDialog, type ConfirmVariant } from "@/components/ui/ConfirmDialog";
import { showToast } from "@/components/ui/Toast";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="font-sans-semibold text-[11px] uppercase tracking-[0.66px] text-text-secondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <View className="size-12 items-center justify-center rounded-full bg-accent">
      <Text className="font-sans-bold text-[15px] text-accent-foreground">{initials}</Text>
    </View>
  );
}

export default function Sandbox() {
  const insets = useSafeAreaInsets();
  const { scheme, setColorScheme, colors } = useColorScheme();
  const [confirm, setConfirm] = useState<ConfirmVariant | null>(null);
  const [sort, setSort] = useState("recent");
  const [text, setText] = useState("");
  const [pw, setPw] = useState("");

  return (
    <View className="flex-1 bg-surface-soft">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 56,
          paddingHorizontal: 20,
          gap: 28,
        }}
      >
        <View className="gap-3">
          <Text className="font-display-bold text-[24px] text-text-primary">Component sandbox</Text>
          <View className="flex-row gap-2">
            <Chip label="Light" selected={scheme === "light"} onPress={() => setColorScheme("light")} />
            <Chip label="Dark" selected={scheme === "dark"} onPress={() => setColorScheme("dark")} />
          </View>
        </View>

        <Section title="Buttons">
          <Button trailingIcon={<ArrowRight size={16} color={colors.accentForeground} strokeWidth={2} />}>
            Send money
          </Button>
          <Button variant="outline" leadingIcon={<Plus size={16} color={colors.textPrimary} strokeWidth={2} />}>
            Add recipient
          </Button>
          <Button variant="ghost">Use password instead</Button>
          <Button size="md">Confirm</Button>
          <Button busy>Sending</Button>
        </Section>

        <Section title="Text fields">
          <TextField label="CIN or username" placeholder="e.g. 09887766" value={text} onChangeText={setText} />
          <TextField label="RIB" placeholder="20 digits" monospace />
          <TextField label="Email" placeholder="you@example.com" error="Enter a valid email address." />
          <PasswordField label="Password" placeholder="Your password" value={pw} onChangeText={setPw} />
        </Section>

        <Section title="OTP entry">
          <Text className="font-sans text-[12px] text-text-muted">Default</Text>
          <OtpInput autoFocus={false} />
          <Text className="font-sans text-[12px] text-text-muted">Card variant</Text>
          <OtpInput autoFocus={false} variant="card" />
          <Text className="font-sans text-[12px] text-text-muted">Error / verified</Text>
          <OtpInput autoFocus={false} state="error" />
          <OtpInput autoFocus={false} state="verified" />
        </Section>

        <Section title="Toasts">
          <View className="flex-row flex-wrap gap-2">
            <Chip label="Success" onPress={() => showToast({ tier: "success", message: "Transfer sent." })} />
            <Chip label="Danger" onPress={() => showToast({ tier: "danger", message: "Unable to load transactions. Please try again." })} />
            <Chip label="Warning" onPress={() => showToast({ tier: "warning", message: "This bank is temporarily inactive." })} />
            <Chip label="Info" onPress={() => showToast({ tier: "info", message: "Your code expires in 5 minutes." })} />
            <Chip label="Neutral" onPress={() => showToast({ tier: "neutral", message: "Nickname updated." })} />
          </View>
        </Section>

        <Section title="Confirm dialog">
          <View className="flex-row flex-wrap gap-2">
            <Chip label="Primary" onPress={() => setConfirm("primary")} />
            <Chip label="Danger" onPress={() => setConfirm("danger")} />
            <Chip label="Warning" onPress={() => setConfirm("warning")} />
            <Chip label="Positive" onPress={() => setConfirm("positive")} />
          </View>
        </Section>

        <Section title="Auth card">
          <AuthCard>
            <PayZoWordmark width={120} />
            <Text className="font-sans text-[13px] text-text-secondary">
              Reset your password in three steps.
            </Text>
            <Button>Continue</Button>
          </AuthCard>
        </Section>

        <Section title="Brand marks">
          <View className="flex-row items-center gap-4">
            <PayZoShield width={44} />
            <PayZoWordmark width={132} />
          </View>
          <GradientHeader variant="authNavy" className="items-center gap-2 py-7">
            <PayZoWordmark width={150} color={colors.textOnInverse} />
            <Text
              className="font-sans-medium text-[10px] uppercase text-text-on-inverse"
              style={{ letterSpacing: 0.8 }}
            >
              EASY · INTELLIGENT · TRUSTED
            </Text>
          </GradientHeader>
        </Section>

        <Section title="Gradient headers">
          <GradientHeader variant="balanceTeal" className="gap-1">
            <Text className="font-sans-medium text-[11px] uppercase tracking-[0.66px] text-text-on-inverse">
              Total balance
            </Text>
            <Text className="font-display-bold text-[36px] text-text-on-inverse">2 480,500</Text>
            <Text className="font-sans text-[12px] text-text-on-inverse">TND</Text>
          </GradientHeader>
        </Section>

        <Section title="Chips">
          <View className="flex-row flex-wrap items-center gap-2">
            <Chip label="Approved" tone="positive" dot />
            <Chip label="Pending review" tone="warning" dot />
            <Chip label="Rejected" tone="negative" dot />
            <Chip label="Cancelled" tone="neutral" dot />
            <Chip label="Saved" tone="accent" />
          </View>
          <View className="flex-row gap-2">
            <Chip label="Recent" selected={sort === "recent"} onPress={() => setSort("recent")} />
            <Chip label="A–Z" selected={sort === "alpha"} onPress={() => setSort("alpha")} />
            <Chip label="Most used" selected={sort === "uses"} onPress={() => setSort("uses")} />
          </View>
        </Section>

        <Section title="List rows">
          <ListRow
            leading={<Avatar initials="SM" />}
            title="Sis"
            subtitle="BIAT · 08 001 0000000000000 79"
            monoSubtitle
            meta="Last used 2 days ago · 7 transfers"
            trailing={<Send size={18} color={colors.textMuted} strokeWidth={2} />}
          />
          <ListRow
            leading={<Avatar initials="KB" />}
            title="Karim Bouaziz"
            subtitle="STB · 10 001 0000000000000 17"
            monoSubtitle
            meta="Not used yet"
            trailing={<Send size={18} color={colors.textMuted} strokeWidth={2} />}
          />
        </Section>

        <Section title="Skeleton">
          <View className="flex-row items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <View className="flex-1 gap-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </View>
          </View>
        </Section>

        <Section title="Empty state">
          <View className="rounded-[16px] border border-border-soft bg-surface-card">
            <EmptyState
              icon={Users}
              title="No saved recipients yet"
              message="Save someone the next time you send. They'll show up here for one-tap transfers."
              action={
                <Button trailingIcon={<ArrowRight size={16} color={colors.accentForeground} strokeWidth={2} />}>
                  Send money
                </Button>
              }
            />
          </View>
        </Section>
      </ScrollView>

      <ConfirmDialog
        open={confirm !== null}
        variant={confirm ?? "primary"}
        title={confirmTitle(confirm)}
        message={confirmMessage(confirm)}
        confirmLabel={confirm === "danger" ? "Remove" : "Confirm"}
        cancelLabel={confirm === "danger" ? "Keep" : "Cancel"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          showToast({ tier: "success", message: "Done." });
        }}
      />
    </View>
  );
}

function confirmTitle(v: ConfirmVariant | null): string {
  switch (v) {
    case "danger":
      return "Remove beneficiary?";
    case "warning":
      return "Leave this screen?";
    case "positive":
      return "Enable fingerprint unlock?";
    default:
      return "Confirm transfer";
  }
}

function confirmMessage(v: ConfirmVariant | null): string {
  switch (v) {
    case "danger":
      return "Sis will no longer appear in your saved list. Transfers you've already sent stay in your history.";
    case "warning":
      return "Your changes on this step won't be saved.";
    case "positive":
      return "Use your fingerprint to unlock PayZo next time instead of your password.";
    default:
      return "Send 10 TND to Sis. You'll confirm with a one-time code.";
  }
}
