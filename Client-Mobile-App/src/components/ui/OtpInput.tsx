import { OtpInput as RNOtpInput } from "react-native-otp-entry";
import { useColorScheme } from "@/hooks/useColorScheme";

export type OtpState =
  | "idle"
  | "submitting"
  | "error"
  | "invalidated"
  | "expired"
  | "verified";

interface OtpInputProps {
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  state?: OtpState;
  autoFocus?: boolean;
  variant?: "default" | "card";
}

export function OtpInput({
  onChange,
  onSubmit,
  state = "idle",
  autoFocus = true,
  variant = "default",
}: OtpInputProps) {
  const { colors } = useColorScheme();
  const locked =
    state === "submitting" ||
    state === "invalidated" ||
    state === "expired" ||
    state === "verified";

  const accentBorder =
    state === "error"
      ? colors.negative
      : state === "verified"
        ? colors.positive
        : colors.accent;
  const textColor =
    state === "error"
      ? colors.negative
      : state === "verified"
        ? colors.positive
        : colors.textPrimary;

  const isCard = variant === "card";
  const cellWidth = isCard ? 52 : 48;
  const cellHeight = isCard ? 64 : 60;

  return (
    <RNOtpInput
      numberOfDigits={6}
      autoFocus={autoFocus && !locked}
      disabled={locked}
      type="numeric"
      focusColor={accentBorder}
      onTextChange={onChange}
      onFilled={onSubmit}
      theme={{
        containerStyle: { gap: 8, opacity: locked && state !== "verified" ? 0.6 : 1 },
        pinCodeContainerStyle: {
          width: cellWidth,
          height: cellHeight,
          borderRadius: isCard ? 12 : 14,
          borderWidth: 1,
          borderColor: colors.borderSoft,
          backgroundColor: isCard ? colors.accentSoft : colors.surfaceCard,
        },
        focusedPinCodeContainerStyle: {
          borderWidth: 2,
          borderColor: accentBorder,
          backgroundColor: colors.surfaceCard,
        },
        filledPinCodeContainerStyle: {
          borderWidth: 2,
          borderColor: accentBorder,
          backgroundColor: colors.surfaceCard,
        },
        pinCodeTextStyle: {
          fontFamily: isCard ? "Inter_700Bold" : "JetBrainsMono_400Regular",
          fontSize: isCard ? 26 : 28,
          color: textColor,
        },
      }}
    />
  );
}
