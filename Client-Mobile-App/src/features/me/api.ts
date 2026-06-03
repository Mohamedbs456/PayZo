import { api } from "@/lib/api/client";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/store/authStore";

export interface ClientProfile {
  id: string;
  keycloakId: string;
  cin: string;
  username: string;
  firstName: string;
  lastName: string;
  profilePictureUrl: string | null;
  trustScore: number;
  defaultAccountId: string | null;
  status: "PENDING_APPROVAL" | "ACCEPTED" | "ACTIVE" | "BLOCKED" | "REJECTED";
  firstLoginCompleted: boolean;
  email: string;
  phone: string;
  address: string;
  governorate: string;
  dateOfBirth: string;
}

export function getProfile() {
  return api.get<ClientProfile>("/client/profile");
}

export function changePassword(req: { currentPassword: string; newPassword: string }) {
  return api.patch<void>("/clients/me/password", req);
}

export interface SetDefaultAccountResponse {
  defaultAccountId: string;
}

export function setDefaultAccount(accountNumber: string) {
  return api.patch<SetDefaultAccountResponse>("/client/profile/default-account", { accountNumber });
}

// 422 USERNAME_INVALID / 409 USERNAME_TAKEN / 409 USERNAME_RESERVED.
export function updateUsername(username: string) {
  return api.patch<ClientProfile>("/client/profile/username", { username });
}

// Multipart upload — backend expects field name `file`. The json client wrapper
// can't carry multipart, so hit fetch directly with the bearer attached. RN's
// FormData takes a { uri, name, type } object for the file part.
export async function uploadProfilePicture(args: {
  uri: string;
  name: string;
  type: string;
}): Promise<string> {
  const form = new FormData();
  form.append("file", { uri: args.uri, name: args.name, type: args.type } as unknown as Blob);
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${env.apiBaseUrl}/client/profile/picture`, {
    method: "PUT",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  const payload = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: { profilePictureUrl?: string };
  } | null;
  if (!res.ok || !payload?.success) {
    throw new ApiError(res.status, payload?.message ?? "Upload failed");
  }
  return payload.data?.profilePictureUrl ?? "";
}
