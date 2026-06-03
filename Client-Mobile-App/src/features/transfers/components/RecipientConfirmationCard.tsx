import { Image, Text, View } from "react-native";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { resolveBackendUrl } from "@/lib/backendUrl";

// Mirrors util/TrustBands.java (50-100 HIGH, 20-49 MED, 0-19 LOW).
type Band = "HIGH" | "MED" | "LOW";

function bandOf(score: number): Band {
  if (score >= 50) return "HIGH";
  if (score >= 20) return "MED";
  return "LOW";
}

const BAND_BG: Record<Band, string> = {
  HIGH: "bg-positive-soft",
  MED: "bg-warning-soft",
  LOW: "bg-negative-soft",
};
const BAND_TEXT: Record<Band, string> = {
  HIGH: "text-positive",
  MED: "text-warning",
  LOW: "text-negative",
};

interface RecipientConfirmationCardProps {
  firstName: string;
  lastName: string;
  username: string;
  profilePictureUrl: string | null;
  trustScore: number;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}

// Shown after resolve-username returns: avatar + name + trust score + two
// buttons. No bank info or masked account — username is the identity proof.
export function RecipientConfirmationCard({
  firstName,
  lastName,
  username,
  profilePictureUrl,
  trustScore,
  busy,
  onConfirm,
  onReject,
}: RecipientConfirmationCardProps) {
  const band = bandOf(trustScore);
  const initials =
    (firstName.trim().charAt(0) + lastName.trim().charAt(0)).toUpperCase() || "··";
  const pictureUrl = resolveBackendUrl(profilePictureUrl);

  return (
    <View className="items-center gap-5 rounded-[20px] border border-border-soft bg-surface-card px-6 py-7">
      <View className="size-20 items-center justify-center overflow-hidden rounded-full bg-accent">
        {pictureUrl ? (
          <Image source={{ uri: pictureUrl }} className="size-full" resizeMode="cover" />
        ) : (
          <Text className="font-sans-bold text-[24px] text-accent-foreground">{initials}</Text>
        )}
      </View>

      <View className="items-center gap-0.5">
        <Text className="font-sans-bold text-[20px] text-text-primary">
          {firstName} {lastName}
        </Text>
        {username ? (
          <Text className="font-sans text-[13px] text-text-secondary">@{username}</Text>
        ) : null}
      </View>

      <View className="flex-row items-center gap-2">
        <Text className="font-sans text-[13px] text-text-secondary">Trust score:</Text>
        <Text className="font-mono-medium text-[15px] text-text-primary">{trustScore}</Text>
        <View className={cn("h-5 items-center justify-center rounded-full px-2", BAND_BG[band])}>
          <Text className={cn("font-sans-bold text-[10px] uppercase tracking-[0.08em]", BAND_TEXT[band])}>
            {band}
          </Text>
        </View>
      </View>

      <View className="w-full gap-2 pt-1">
        <Button onPress={onConfirm} disabled={busy}>
          Yes, that's them
        </Button>
        <Button variant="ghost" size="md" onPress={onReject} disabled={busy}>
          No, go back
        </Button>
      </View>
    </View>
  );
}
