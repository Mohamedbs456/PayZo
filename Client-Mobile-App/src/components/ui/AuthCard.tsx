import type { ReactNode } from "react";
import { View } from "react-native";
import { cn } from "@/lib/cn";

export function AuthCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      style={{
        shadowColor: "#0e1b2c",
        shadowOpacity: 0.06,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
      className={cn(
        "w-full max-w-[560px] flex-col gap-7 rounded-[20px] border border-border-soft bg-surface-card p-6",
        className,
      )}
    >
      {children}
    </View>
  );
}
