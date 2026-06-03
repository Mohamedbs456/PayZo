/**
 * Canonical password policy (DECISIONS.md D46 / Impact 21). Used by both
 * the in-profile change-password page and any future forgot-password reset
 * flow — keep this file as the single source of truth so the rules don't
 * drift between surfaces.
 */

export interface PolicyCheck {
  id: string;
  label: string;
  passed: boolean;
}

export function evaluatePassword(password: string): PolicyCheck[] {
  return [
    // 12 chars matches Keycloak's realm policy — keep these in sync, see
    // PasswordPolicy.java on the BE for the same constant.
    { id: "length", label: "At least 12 characters", passed: password.length >= 12 },
    {
      id: "upper",
      label: "One uppercase letter",
      passed: /[A-Z]/.test(password),
    },
    {
      id: "lower",
      label: "One lowercase letter",
      passed: /[a-z]/.test(password),
    },
    { id: "digit", label: "One digit", passed: /\d/.test(password) },
    {
      id: "symbol",
      label: "One symbol (!@#$%^&*…)",
      passed: /[^A-Za-z0-9]/.test(password),
    },
  ];
}

export function isPasswordValid(password: string): boolean {
  return evaluatePassword(password).every((c) => c.passed);
}
