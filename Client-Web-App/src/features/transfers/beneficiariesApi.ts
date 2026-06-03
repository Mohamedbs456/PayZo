import { api, type PagedResponse } from "@/lib/api";

// Beneficiaries replace the old favorites system. A beneficiary is keyed by RIB
// and may point at a PayZo user or a non-PayZo CBS account. Backend orders by
// favorite DESC, then lastUsedAt DESC NULLS LAST, then cachedFirstName ASC.

export interface BeneficiaryResponse {
  id: string;
  accountNumber: string;          // 20-digit RIB
  displayName: string;            // nickname OR cached first+last
  nickname: string | null;
  bankCode: string | null;        // alpha mnemonic (e.g. "STB")
  favorite: boolean;
  transferCount: number;
  confirmedAt: string | null;     // first successful transfer
  lastUsedAt: string | null;
  createdAt: string;
  initials: string;
  profilePictureUrl?: string | null;   // populated when the recipient is a PayZo user
  payzoUser?: boolean;                  // drives bubble-row avatar fallback
}

export interface CreateBeneficiaryRequest {
  rib: string;
  firstName: string;
  lastName: string;
  nickname?: string;
}

export interface UpdateBeneficiaryNicknameRequest {
  nickname?: string;
}

export function listBeneficiaries(page = 0, size = 50) {
  return api.get<PagedResponse<BeneficiaryResponse>>("/client/beneficiaries", {
    query: { page, size },
  });
}

export function createBeneficiary(req: CreateBeneficiaryRequest) {
  return api.post<BeneficiaryResponse>("/client/beneficiaries", req);
}

export function updateBeneficiaryNickname(
  id: string,
  req: UpdateBeneficiaryNicknameRequest,
) {
  return api.patch<BeneficiaryResponse>(`/client/beneficiaries/${id}`, req);
}

export function toggleBeneficiaryFavorite(id: string) {
  return api.put<BeneficiaryResponse>(
    `/client/beneficiaries/${id}/favorite`,
  );
}

export function deleteBeneficiary(id: string) {
  return api.delete<void>(`/client/beneficiaries/${id}`);
}
