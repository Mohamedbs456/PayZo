import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { resolveBackendUrl } from "@/lib/backendUrl";
import { usePhotoVersion, withPhotoVersion } from "@/store/photoVersion";

// Shows the profile photo when one exists, falling back to initials (on a
// missing URL or a load error). Pass the raw server-relative path; resolution
// + a re-load on URL change (cache-busting) are handled here.
export function Avatar({
  url,
  initials,
  size,
  className,
}: {
  url?: string | null;
  initials: string;
  size: number;
  className?: string;
}) {
  const version = usePhotoVersion((s) => s.version);
  const resolved = withPhotoVersion(resolveBackendUrl(url), version);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resolved]);

  const showPhoto = !!resolved && !failed;
  return (
    <View
      className={cn("items-center justify-center overflow-hidden rounded-full bg-accent", className)}
      style={{ width: size, height: size }}
    >
      {showPhoto ? (
        <Image
          source={{ uri: resolved as string }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text className="font-sans-bold text-accent-foreground" style={{ fontSize: Math.round(size * 0.38) }}>
          {initials}
        </Text>
      )}
    </View>
  );
}
