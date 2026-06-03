import { Text, View } from "react-native";
import { Check, Circle } from "lucide-react-native";
import { cn } from "@/lib/cn";
import { useColorScheme } from "@/hooks/useColorScheme";
import { evaluatePassword } from "@/features/me/passwordPolicy";

export function PasswordRequirementsList({ password }: { password: string }) {
  const { colors } = useColorScheme();
  const checks = evaluatePassword(password);
  return (
    <View className="gap-1.5">
      {checks.map((c) => (
        <View key={c.id} className="flex-row items-center gap-2">
          {c.passed ? (
            <Check size={14} color={colors.positive} strokeWidth={2.4} />
          ) : (
            <Circle size={14} color={colors.textFaint} strokeWidth={2} />
          )}
          <Text
            className={cn(
              "font-sans text-[12px]",
              c.passed ? "text-text-secondary" : "text-text-muted",
            )}
          >
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
