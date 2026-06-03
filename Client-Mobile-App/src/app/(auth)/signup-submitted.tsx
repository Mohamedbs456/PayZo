import { Text, View } from "react-native";
import { router } from "expo-router";
import { Clock } from "lucide-react-native";
import { AuthScreen } from "@/components/layout/AuthScreen";
import { Button } from "@/components/ui/Button";
import { useColorScheme } from "@/hooks/useColorScheme";
import { signupFlow } from "@/store/authFlow";

export default function SignupSubmittedScreen() {
  const { colors } = useColorScheme();
  return (
    <AuthScreen>
      <View className="items-center gap-4 pt-4">
        <View className="size-14 items-center justify-center rounded-full bg-accent-soft">
          <Clock size={26} color={colors.accent} strokeWidth={2} />
        </View>
        <Text className="text-center font-display-bold text-[24px] text-text-primary">
          Request submitted
        </Text>
        <Text className="max-w-[320px] text-center font-sans text-[14px] leading-5 text-text-secondary">
          Your account is now under review. You'll be able to sign in once it's approved.
        </Text>
      </View>
      <Button
        onPress={() => {
          signupFlow.clear();
          router.replace("/login");
        }}
      >
        Back to sign in
      </Button>
    </AuthScreen>
  );
}
