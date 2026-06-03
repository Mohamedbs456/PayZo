export interface PolicyCheck {
  id: string;
  label: string;
  passed: boolean;
}

// Mirrors Keycloak/realms/clients-realm.json + backend PasswordPolicy.java.
export function evaluatePassword(password: string): PolicyCheck[] {
  return [
    { id: "length", label: "At least 12 characters", passed: password.length >= 12 },
    { id: "upper", label: "One uppercase letter", passed: /[A-Z]/.test(password) },
    { id: "lower", label: "One lowercase letter", passed: /[a-z]/.test(password) },
    { id: "digit", label: "One digit", passed: /\d/.test(password) },
    { id: "symbol", label: "One symbol (!@#$%^&*…)", passed: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return evaluatePassword(password).every((c) => c.passed);
}
