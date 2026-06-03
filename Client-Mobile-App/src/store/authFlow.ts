import type { OtpChannel } from "@/lib/api/endpoints";
import type { RawTokenResponse } from "@/lib/auth/keycloak";

// Ephemeral login-flow state shared across the login -> channel -> verify
// screens. A module-level holder (not React context) survives the screen
// unmounts that expo-router does on navigation.
export interface LoginFlowState {
  tokens: RawTokenResponse;
  userId: string;
  identifier: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
  channel?: OtpChannel;
  maskedDestination?: string | null;
}

let state: LoginFlowState | null = null;

export const loginFlow = {
  set: (next: LoginFlowState) => {
    state = next;
  },
  patch: (partial: Partial<LoginFlowState>) => {
    if (state) state = { ...state, ...partial };
  },
  get: () => state,
  clear: () => {
    state = null;
  },
};

export interface SignupFlowState {
  cin: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  governorate: string;
  channel?: OtpChannel;
  maskedDestination?: string;
}

let signupState: SignupFlowState | null = null;

export const signupFlow = {
  set: (next: SignupFlowState) => {
    signupState = next;
  },
  patch: (partial: Partial<SignupFlowState>) => {
    if (signupState) signupState = { ...signupState, ...partial };
  },
  get: () => signupState,
  clear: () => {
    signupState = null;
  },
};

export interface ForgotFlowState {
  cin: string;
  maskedDestination: string;
  resetToken?: string;
}

let forgotState: ForgotFlowState | null = null;

export const forgotFlow = {
  set: (next: ForgotFlowState) => {
    forgotState = next;
  },
  patch: (partial: Partial<ForgotFlowState>) => {
    if (forgotState) forgotState = { ...forgotState, ...partial };
  },
  get: () => forgotState,
  clear: () => {
    forgotState = null;
  },
};
