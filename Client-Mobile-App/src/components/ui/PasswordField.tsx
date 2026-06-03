import { forwardRef, useState, type ReactNode } from "react";
import { Pressable, TextInput } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { TextField } from "@/components/ui/TextField";
import { useColorScheme } from "@/hooks/useColorScheme";

interface PasswordFieldProps {
  label: string;
  labelAdornment?: ReactNode;
  error?: string | null;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  editable?: boolean;
  textContentType?: "password" | "newPassword";
}

export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(function PasswordField(
  { label, labelAdornment, error, ...rest },
  ref,
) {
  const { colors } = useColorScheme();
  const [revealed, setRevealed] = useState(false);
  const Icon = revealed ? EyeOff : Eye;

  return (
    <TextField
      ref={ref}
      label={label}
      labelAdornment={labelAdornment}
      error={error}
      secureTextEntry={!revealed}
      monospace={!revealed}
      autoCapitalize="none"
      autoCorrect={false}
      rightSlot={
        <Pressable
          onPress={() => setRevealed((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={revealed ? "Hide password" : "Show password"}
          accessibilityState={{ selected: revealed }}
          hitSlop={8}
        >
          <Icon size={20} color={colors.textMuted} strokeWidth={1.6} />
        </Pressable>
      }
      {...rest}
    />
  );
});
