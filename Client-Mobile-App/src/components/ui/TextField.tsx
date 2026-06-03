import { forwardRef, useState, type ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";

interface TextFieldProps extends TextInputProps {
  label: string;
  labelAdornment?: ReactNode;
  rightSlot?: ReactNode;
  monospace?: boolean;
  error?: string | null;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, labelAdornment, rightSlot, monospace = false, error, onFocus, onBlur, ...rest },
  ref,
) {
  const { colors } = useColorScheme();
  const [focused, setFocused] = useState(false);

  return (
    <View className="w-full flex-col gap-2">
      <View className="flex-row items-center justify-between">
        <Text className="font-sans-medium text-[11px] uppercase tracking-[0.66px] text-text-secondary">
          {label}
        </Text>
        {labelAdornment}
      </View>
      <View
        className={cn(
          "flex-row items-center gap-2.5 rounded-xl border bg-surface-card px-4 py-3.5",
          error ? "border-negative" : focused ? "border-accent" : "border-border",
        )}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={cn(
            "min-w-0 flex-1 p-0 text-[14px] text-text-primary",
            monospace && "font-mono",
          )}
          {...rest}
        />
        {rightSlot}
      </View>
      {error ? <Text className="font-sans text-[12px] text-negative">{error}</Text> : null}
    </View>
  );
});
