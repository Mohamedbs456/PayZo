/**
 * Read-only profile preview rendered after a CIN is resolved against
 * the CBS (Figma node 77:38). The "VERIFIED FROM YOUR BANK" pill makes
 * it explicit that these values come from the central banking system —
 * editing them is out of scope for the client app (DECISIONS.md, profile
 * is read-only).
 */

export interface VerifiedProfile {
  firstName: string;
  lastName: string;
  cin: string;
  email: string;
  phone: string;
  governorate: string;
}

interface Row {
  label: string;
  value: string;
  monospace?: boolean;
}

export function VerifiedProfileCard({ profile }: { profile: VerifiedProfile }) {
  const rows: Row[] = [
    { label: "First name", value: profile.firstName },
    { label: "Last name", value: profile.lastName },
    { label: "CIN", value: profile.cin, monospace: true },
    { label: "Email", value: profile.email },
    { label: "Phone", value: profile.phone, monospace: true },
    { label: "Governorate", value: profile.governorate },
  ];

  return (
    <div className="flex w-full flex-col gap-3.5 rounded-[14px] border border-border-soft bg-surface-card px-6 py-5">
      <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-positive-soft py-[3px] pl-2 pr-2.5">
        <span className="size-1.5 rounded-full bg-positive" aria-hidden />
        <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-positive">
          Verified from your bank
        </span>
      </span>

      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3"
        >
          <span className="font-sans text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted">
            {row.label}
          </span>
          <span
            className={
              row.monospace
                ? "font-mono text-[13px] text-text-primary"
                : "font-sans text-[14px] font-semibold text-text-primary"
            }
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
