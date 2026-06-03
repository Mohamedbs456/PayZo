import { api } from "@/lib/api/client";
import type { PagedResponse } from "@/lib/api/types";

// A beneficiary is keyed by RIB and may point at a PayZo user or a non-PayZo
// CBS account. Backend orders by favorite DESC, then lastUsedAt DESC NULLS LAST,
// then cachedFirstName ASC.

export interface BeneficiaryResponse {
  id: string;
  accountNumber: string;
  displayName: string;
  nickname: string | null;
  bankCode: string | null;
  favorite: boolean;
  transferCount: number;
  confirmedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  initials: string;
  profilePictureUrl?: string | null;
  payzoUser?: boolean;
}

export interface UpdateBeneficiaryNicknameRequest {
  nickname?: string;
}

export function listBeneficiaries(page = 0, size = 50) {
  return api.get<PagedResponse<BeneficiaryResponse>>("/client/beneficiaries", {
    query: { page, size },
  });
}

export function updateBeneficiaryNickname(
  id: string,
  req: UpdateBeneficiaryNicknameRequest,
) {
  return api.patch<BeneficiaryResponse>(`/client/beneficiaries/${id}`, req);
}

export function toggleBeneficiaryFavorite(id: string) {
  return api.put<BeneficiaryResponse>(`/client/beneficiaries/${id}/favorite`);
}

export function deleteBeneficiary(id: string) {
  return api.delete<void>(`/client/beneficiaries/${id}`);
}
