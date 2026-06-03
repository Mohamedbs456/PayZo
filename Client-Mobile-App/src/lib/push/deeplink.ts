import type { Href } from "expo-router";

export type PushData = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// Maps a notification payload to the in-app route to open on tap. The target
// routes already exist; FCM delivers data values as strings.
export function routeForPush(data: PushData): Href {
  const type = str(data.type);
  const id = str(data.id);

  switch (type) {
    case "TRX_RECEIVED":
    case "TRX_APPROVED":
    case "TRX_REJECTED":
      return id ? { pathname: "/(tabs)/transactions", params: { ref: id } } : "/(tabs)/transactions";
    case "FRAUD_ALERT_PENDING":
      return id ? { pathname: "/alerts", params: { id } } : "/alerts";
    case "REGISTRATION_APPROVED":
      return "/(tabs)/dashboard";
    case "BANK_DEACTIVATED":
    case "BANK_REACTIVATED":
      return "/(tabs)/accounts";
    default:
      return "/notifications";
  }
}
