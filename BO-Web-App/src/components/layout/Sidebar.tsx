import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Landmark,
  UserCog,
  ArrowLeftRight,
  ShieldAlert,
  Cpu,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import logoSidebar from "@/assets/logo-sidebar.svg";
import { ProfileMenu } from "./ProfileMenu";
import { primaryRole, roleLabel, session } from "@/lib/auth/session";
import type { BoRole } from "@/lib/auth/types";
import { useBoMe } from "@/features/me/BoMeProvider";
import { resolveBackendUrl } from "@/lib/backendUrl";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  /** Roles allowed to see this item. Empty/undefined = visible to all. */
  allow: BoRole[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      {
        to: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        allow: ["SUPERADMIN", "ADMIN", "ANALYST"],
      },
    ],
  },
  {
    title: "ENTITIES",
    items: [
      { to: "/clients", label: "Clients", icon: Users, allow: ["SUPERADMIN", "ADMIN"] },
      { to: "/accounts", label: "Accounts", icon: Landmark, allow: ["SUPERADMIN", "ADMIN"] },
      {
        to: "/staff-management",
        label: "Staff Management",
        icon: UserCog,
        allow: ["SUPERADMIN"],
      },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      {
        to: "/transactions",
        label: "Transactions",
        icon: ArrowLeftRight,
        allow: ["SUPERADMIN", "ADMIN", "ANALYST"],
      },
      {
        to: "/fraud-alerts",
        label: "Fraud Alerts",
        icon: ShieldAlert,
        allow: ["SUPERADMIN", "ANALYST"],
      },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      {
        to: "/ml-config",
        label: "ML Config",
        icon: Cpu,
        allow: ["SUPERADMIN", "ANALYST"],
      },
      {
        to: "/audit-log",
        label: "Audit Log",
        icon: FileText,
        allow: ["SUPERADMIN"],
      },
    ],
  },
];

export function Sidebar() {
  const role = primaryRole();
  const sections = useMemo(() => filterByRole(NAV_SECTIONS, role), [role]);
  const profile = useProfileLabels();

  return (
    <aside className="flex w-[240px] shrink-0 flex-col self-stretch overflow-hidden border-r-2 border-brand-medium bg-brand-cream">
      <div className="flex h-[84px] shrink-0 items-center justify-center overflow-hidden border-b-2 border-brand-medium bg-white p-6">
        <img src={logoSidebar} alt="PayZo" className="h-10 w-[157px]" />
      </div>

      <nav className="flex w-full min-h-0 flex-1 flex-col gap-0.5 p-3">
        {sections.map((section) => (
          <SidebarSection key={section.title} section={section} />
        ))}
      </nav>

      <div className="flex w-full shrink-0 flex-col px-3 pb-4">
        <ProfileMenu
          fullName={profile.fullName}
          initials={profile.initials}
          roleLabel={profile.role}
          profilePictureUrl={profile.profilePictureUrl}
        />
      </div>
    </aside>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function filterByRole(sections: NavSection[], role: BoRole | null): NavSection[] {
  if (role === null) return [];
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((it) => it.allow.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

function useProfileLabels() {
  const s = session.get();
  const { me } = useBoMe();
  const username = s?.username ?? "";
  // Prefer the live `/me` payload (real first/last name + picture) when
  // available; fall back to a friendly version of the JWT's username so
  // the sidebar still reads sanely on the very first paint before /me
  // resolves.
  const fullName = me
    ? `${me.firstName} ${me.lastName}`.trim() || displayName(username)
    : displayName(username);
  const initials = me
    ? ((me.firstName?.[0] ?? "") + (me.lastName?.[0] ?? "")).toUpperCase() ||
      computeInitials(fullName)
    : computeInitials(fullName);
  const role = roleLabel() || "—";
  const profilePictureUrl = resolveBackendUrl(me?.profilePictureUrl);
  return { fullName, initials, role, profilePictureUrl };
}

function displayName(username: string): string {
  if (!username) return "Signed in";
  // "admin.chawki" → "Admin Chawki", "superadmin" → "Superadmin"
  return username
    .split(/[._\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function computeInitials(fullName: string): string {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─── Building blocks ────────────────────────────────────────────────── */

function SidebarSection({ section }: { section: NavSection }) {
  return (
    <>
      <div className="flex w-full shrink-0 flex-col overflow-hidden px-3 pb-2 pt-2.5">
        <p className="whitespace-nowrap font-sans text-[10px] font-bold tracking-[1.8px] text-text-faint">
          {section.title}
        </p>
      </div>
      {section.items.map((item) => (
        <SidebarNavItem key={item.to} item={item} />
      ))}
    </>
  );
}

function SidebarNavItem({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          "group relative flex h-11 w-full shrink-0 items-center overflow-hidden rounded-[10px] transition-colors duration-150 ease-out",
          isActive
            ? "bg-brand-cream-2 gap-2 pl-2 pr-3"
            : "gap-3 px-3 hover:bg-brand-cream-2/40",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className="block h-[22px] w-[3px] shrink-0 rounded-[2px] bg-brand-dark"
              aria-hidden
            />
          )}
          <Icon
            className={cn(
              "size-[18px] shrink-0",
              isActive ? "text-text-primary" : "text-text-muted",
            )}
            strokeWidth={2}
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-sans text-[14px]",
              isActive
                ? "font-semibold text-text-primary"
                : "font-medium text-text-muted",
            )}
          >
            {item.label}
          </span>
          {item.badge !== undefined && (
            <span className="flex shrink-0 items-center overflow-hidden rounded-full bg-danger px-2 py-[3px] font-sans text-[10px] font-bold text-white">
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
