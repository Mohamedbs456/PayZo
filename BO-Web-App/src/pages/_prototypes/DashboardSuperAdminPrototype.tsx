import { Fragment, type ReactNode } from "react";
import { ArrowRight, Cpu, TrendingDown } from "lucide-react";
import donutClients from "@/assets/donut-clients-per-bank.svg";
import donutSlice1 from "@/assets/donut-tx-slice-1.svg";
import donutSlice2 from "@/assets/donut-tx-slice-2.svg";
import donutSlice3 from "@/assets/donut-tx-slice-3.svg";
import donutSlice4 from "@/assets/donut-tx-slice-4.svg";
import donutSlice5 from "@/assets/donut-tx-slice-5.svg";
import curveBiat from "@/assets/curve-biat.svg";
import curveBna from "@/assets/curve-bna.svg";
import curveStb from "@/assets/curve-stb.svg";
import curveAtb from "@/assets/curve-atb.svg";
import curveUib from "@/assets/curve-uib.svg";
import { cn } from "@/lib/cn";

/**
 * SuperAdmin dashboard — Figma node 79:2 ("02 · Dashboard — SuperAdmin").
 *
 * Fit-to-viewport: rows distribute vertical space using Figma's height
 * ratios (149 : 258 : 241). Cards within each row use Figma's width
 * ratios (no hardcoded widths — fluid between 1280 and 1920). Bars and
 * chart heights are percentage-based so they never overflow their
 * container as the viewport shrinks.
 */
export function DashboardPage() {
  return (
    <div className="flex h-full w-full flex-col gap-[7px] overflow-hidden px-6 py-5">
      <section className="flex h-[149px] w-full shrink-0 items-start gap-4 overflow-hidden">
        <StaffCard />
        <ClientsPerBankCard />
        <FraudRateCard />
      </section>

      <section className="flex h-[258px] w-full shrink-0 items-start gap-4 overflow-hidden">
        <MoneySentPerBankCard />
        <TransactionsPerBankCard />
      </section>

      <section className="flex h-[241px] w-full shrink-0 items-start gap-4 overflow-hidden">
        <RecentTransactionsCard />
        <RecentFraudAlertsCard />
        <MLModelCard />
      </section>
    </div>
  );
}

/* ─── Card primitive ────────────────────────────────────────────────── */

function Card({
  children,
  growRatio,
  height,
  className,
}: {
  children: ReactNode;
  /** Figma width in 1152px content row. Drives flex-grow proportion. */
  growRatio: number;
  /** Figma fixed card height (px). Row has extra slack to match Figma. */
  height: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 shrink basis-0 flex-col overflow-hidden rounded-3xl bg-white",
        "shadow-[0_1px_2px_0_rgba(42,31,20,0.04),0_8px_24px_-6px_rgba(42,31,20,0.10)]",
        className,
      )}
      style={{ flexGrow: growRatio, height: `${height}px` }}
    >
      {children}
    </div>
  );
}

/* ─── Row 1 ─────────────────────────────────────────────────────────── */

function StaffCard() {
  // Faithful to Figma node 94:6: bars-container is h-75 with each group
  // sharing a bottom-aligned cluster of bar (fixed px) + gap + label. The
  // ADMINS group is intentionally h-49 so its 80-px bar gets clipped at
  // the top — that's why the rendered ADMINS visibly reads as ~31 px tall
  // (vs 40 / 55 for ANALYSTS / BANKS).
  const bars = [
    { label: "ADMINS", barPx: 80, groupH: 49, color: "bg-brand-medium" },
    { label: "ANALYSTS", barPx: 40, groupH: 75, color: "bg-brand-light" },
    { label: "BANKS", barPx: 55, groupH: 75, color: "bg-text-faint" },
  ];
  return (
    <Card growRatio={1} height={140} className="px-[22px] py-[18px]">
      <div className="flex w-full shrink-0 flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <p className="font-sans text-[11px] font-bold tracking-[1.76px] text-brand-medium">
          STAFF
        </p>
        <p className="font-sans text-[11px] text-text-muted">
          Hover bars to see counts
        </p>
      </div>
      <div className="mt-3.5 flex h-[75px] w-full shrink-0 items-end gap-[22px] overflow-hidden">
        {bars.map((b) => (
          <div
            key={b.label}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2 overflow-hidden"
            style={{ height: `${b.groupH}px` }}
          >
            <div
              className={cn("w-full shrink-0 rounded-md", b.color)}
              style={{ height: `${b.barPx}px` }}
            />
            <p className="shrink-0 whitespace-nowrap font-sans text-[10px] font-bold tracking-[1.4px] text-text-muted">
              {b.label}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ClientsPerBankCard() {
  return (
    <Card growRatio={1} height={140} className="relative px-[22px] py-[18px]">
      <div className="flex shrink-0 flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <p className="font-sans text-[11px] font-bold tracking-[1.76px] text-brand-medium">
          CLIENTS PER BANK
        </p>
        <div className="mt-3 flex items-baseline gap-1.5 overflow-hidden">
          <p className="font-sans text-[22px] font-bold text-text-primary">
            1,247
          </p>
          <p className="font-sans text-[11px] text-text-muted">
            across 15 banks
          </p>
        </div>
      </div>
      <img
        src={donutClients}
        alt=""
        className="absolute right-[22px] top-[18px] size-[100px] object-contain"
      />
    </Card>
  );
}

function FraudRateCard() {
  return (
    <Card growRatio={1} height={140} className="px-[22px] py-[18px]">
      <div className="flex h-[29px] w-full shrink-0 items-center overflow-hidden">
        <p className="whitespace-nowrap font-sans text-[11px] font-bold tracking-[1.76px] text-brand-medium">
          FRAUD RATE · THIS WEEK
        </p>
        <div className="min-w-0 flex-1" />
        <span className="flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-[#dff5ec] px-2 py-[3px]">
          <span className="size-1.5 shrink-0 rounded-full bg-[#3fa885]" />
          <span className="whitespace-nowrap font-sans text-[9px] font-bold tracking-[1.08px] text-[#3fa885]">
            IMPROVING
          </span>
        </span>
      </div>
      <div className="flex h-[54px] w-full shrink-0 items-baseline gap-1 overflow-hidden whitespace-nowrap font-sans font-bold leading-none">
        <p className="text-[44px] text-text-primary">0.82</p>
        <p className="text-[22px] text-brand-medium">%</p>
      </div>
      <div className="flex h-[15px] w-full shrink-0 items-center gap-1.5 overflow-hidden">
        <TrendingDown className="size-3.5 shrink-0 text-[#3fa885]" strokeWidth={2.4} />
        <p className="whitespace-nowrap font-sans text-[12px] font-semibold text-[#3fa885]">
          −0.14 pp
        </p>
        <p className="whitespace-nowrap font-sans text-[12px] text-text-muted">
          vs prior week
        </p>
      </div>
    </Card>
  );
}

/* ─── Row 2 ─────────────────────────────────────────────────────────── */

function MoneySentPerBankCard() {
  const periods = ["1D", "30D", "1Y", "ALL"] as const;
  const active = "30D";
  return (
    <Card growRatio={764} height={245} className="px-[22px] py-[18px]">
      <div className="flex w-full shrink-0 items-center gap-3 overflow-hidden">
        <div className="flex min-w-0 shrink flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
          <p className="truncate font-sans text-[14px] font-bold text-text-primary">
            Money sent per bank
          </p>
          <p className="truncate font-sans text-[11px] text-text-muted">
            TND moved · hover for detail
          </p>
        </div>
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center overflow-hidden rounded-[10px] bg-brand-cream p-[3px]">
          {periods.map((p) => {
            const isActive = p === active;
            return (
              <button
                key={p}
                type="button"
                className={cn(
                  "flex items-center overflow-hidden rounded-lg px-3 py-1.5 transition-colors duration-150 ease-out",
                  isActive ? "bg-white" : "hover:bg-white/60",
                )}
              >
                <span
                  className={cn(
                    "whitespace-nowrap font-sans text-[11px]",
                    isActive
                      ? "font-semibold text-text-primary"
                      : "font-medium text-text-muted",
                  )}
                >
                  {p}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3.5 flex w-full min-h-0 flex-1 items-stretch gap-2 overflow-hidden">
        <div className="flex h-full shrink-0 flex-col items-end justify-between overflow-hidden whitespace-nowrap pb-1.5 pt-1.5 font-sans text-[9px] font-medium text-text-muted">
          <p>500K</p>
          <p>250K</p>
          <p>0</p>
        </div>
        <div className="relative h-full min-w-0 flex-1 overflow-hidden">
          <span className="pointer-events-none absolute left-0 right-0 top-[25%] h-px bg-brand-cream-2/60" />
          <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-brand-cream-2/60" />
          <span className="pointer-events-none absolute left-0 right-0 top-[75%] h-px bg-brand-cream-2/60" />
          <CurveLayer src={curveBiat} />
          <CurveLayer src={curveBna} />
          <CurveLayer src={curveStb} />
          <CurveLayer src={curveAtb} />
          <CurveLayer src={curveUib} />
        </div>
      </div>
      <div className="mt-1.5 flex w-full shrink-0 items-center justify-between overflow-hidden whitespace-nowrap font-sans text-[10px] font-medium text-text-muted">
        <p>Apr 5</p>
        <p>Apr 11</p>
        <p>Apr 18</p>
        <p>Apr 25</p>
        <p>May 1</p>
        <p>May 4</p>
      </div>
    </Card>
  );
}

function CurveLayer({ src }: { src: string }) {
  return (
    <img
      src={src}
      alt=""
      className="absolute inset-0 size-full"
      style={{ objectFit: "fill" }}
    />
  );
}

function TransactionsPerBankCard() {
  // Figma TX donut: body wrapper is 250×219 absolute at (61, 58) in card,
  // overflow-clip. Inside, the 296×259 donut overflows the wrapper, with
  // 5 slices positioned absolutely in 124×135 sub-boxes at (75, 50).
  const slices: { src: string; inset: string }[] = [
    { src: donutSlice1, inset: "0 0 34.55% 50%" },
    { src: donutSlice2, inset: "59.58% 2.45% 0 43.73%" },
    { src: donutSlice3, inset: "59.58% 53.89% 0.39% 2.45%" },
    { src: donutSlice4, inset: "18.13% 73.89% 34.55% 0" },
    { src: donutSlice5, inset: "0 50% 69.76% 11.47%" },
  ];
  return (
    <Card growRatio={372} height={245} className="relative px-[22px] py-[18px]">
      <div className="flex h-[32px] w-full shrink-0 flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[14px] font-bold text-text-primary">
          Transactions per bank
        </p>
        <p className="truncate font-sans text-[11px] text-text-muted">
          Last 30 days · hover slice for count
        </p>
      </div>
      <div className="absolute left-[61px] top-[58px] flex h-[219px] w-[250px] flex-col items-center justify-center overflow-hidden">
        <div className="relative h-[259px] w-[296px] shrink-0">
          {slices.map((s, i) => (
            <div
              key={i}
              className="absolute h-[124px] w-[135px] left-[75px] top-[50px]"
            >
              <div className="absolute" style={{ inset: s.inset }}>
                <img src={s.src} alt="" className="block size-full max-w-none" />
              </div>
            </div>
          ))}
          <div className="absolute left-[79px] top-[61px] flex h-[102px] w-[127px] flex-col items-center justify-center overflow-hidden whitespace-nowrap font-sans font-bold leading-none">
            <p className="text-[18px] text-text-primary">38,492</p>
            <p className="mt-1.5 font-sans text-[7px] tracking-[1.12px] text-text-muted">
              TRANSACTIONS
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ─── Row 3 ─────────────────────────────────────────────────────────── */

interface TxRow {
  initials: string;
  name: string;
  meta: string;
  amount: string;
  amountTone: "credit" | "debit";
  time: string;
}

const RECENT_TX: TxRow[] = [
  {
    initials: "SM",
    name: "Sara Mansouri",
    meta: "BIAT → STB · TRX-9F2A18",
    amount: "+ 250 TND",
    amountTone: "credit",
    time: "14:32",
  },
  {
    initials: "KB",
    name: "Karim Bouaziz",
    meta: "BNA → ATB · TRX-3081FB",
    amount: "− 1,200 TND",
    amountTone: "debit",
    time: "11:08",
  },
  {
    initials: "YL",
    name: "Yacine Laribi",
    meta: "STB → CIB · TRX-7E0A2C",
    amount: "− 4,500 TND",
    amountTone: "debit",
    time: "09:14",
  },
];

function RecentTransactionsCard() {
  return (
    <Card growRatio={388} height={233}>
      <CardHeader title="Recent transactions" subtitle="Last 3 across the platform" />
      <Divider tone="strong" />
      {RECENT_TX.map((row, i) => (
        <Fragment key={row.meta}>
          <TxListRow row={row} />
          {i < RECENT_TX.length - 1 && <Divider tone="soft" />}
        </Fragment>
      ))}
    </Card>
  );
}

function TxListRow({ row }: { row: TxRow }) {
  return (
    <div className="flex w-full shrink-0 items-center gap-3 overflow-hidden px-[22px] py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-cream-2 font-sans text-[11px] font-bold text-text-primary">
        {row.initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-px overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[12px] font-semibold text-text-primary">
          {row.name}
        </p>
        <p className="truncate font-sans text-[10px] text-text-muted">
          {row.meta}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-px overflow-hidden whitespace-nowrap leading-none">
        <p
          className={cn(
            "font-sans text-[12px] font-bold",
            row.amountTone === "credit" ? "text-[#3fa885]" : "text-danger",
          )}
        >
          {row.amount}
        </p>
        <p className="font-sans text-[10px] text-text-muted">{row.time}</p>
      </div>
    </div>
  );
}

interface FraudAlertRow {
  name: string;
  level: "HIGH" | "MED";
  meta: string;
  age: string;
}

const RECENT_ALERTS: FraudAlertRow[] = [
  { name: "Yacine Laribi", level: "HIGH", meta: "−4,500 TND · BIAT→STB", age: "12m" },
  { name: "Sara Mansouri", level: "MED", meta: "−1,800 TND · BNA→ATB", age: "34m" },
  { name: "Karim Bouaziz", level: "HIGH", meta: "−8,200 TND · STB→CIB", age: "1h" },
];

function RecentFraudAlertsCard() {
  return (
    <Card growRatio={352} height={233}>
      <CardHeader title="Recent fraud alerts" subtitle="7 needing decision" />
      <Divider tone="strong" />
      {RECENT_ALERTS.map((row, i) => (
        <Fragment key={`${row.name}-${row.age}`}>
          <FraudAlertListRow row={row} />
          {i < RECENT_ALERTS.length - 1 && <Divider tone="soft" />}
        </Fragment>
      ))}
    </Card>
  );
}

function FraudAlertListRow({ row }: { row: FraudAlertRow }) {
  const isHigh = row.level === "HIGH";
  return (
    <div className="flex w-full shrink-0 items-center gap-3 overflow-hidden px-[22px] py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px] overflow-hidden leading-none">
        <div className="flex w-full shrink-0 items-center gap-2 overflow-hidden">
          <p className="truncate whitespace-nowrap font-sans text-[12px] font-semibold text-text-primary">
            {row.name}
          </p>
          <span
            className={cn(
              "flex shrink-0 items-center overflow-hidden rounded px-1.5 py-px",
              isHigh ? "bg-[#fde6e6]" : "bg-[#fbe9c9]",
            )}
          >
            <span
              className={cn(
                "whitespace-nowrap font-sans text-[9px] font-bold tracking-[1.08px]",
                isHigh ? "text-danger" : "text-[#cf821a]",
              )}
            >
              {row.level}
            </span>
          </span>
        </div>
        <p className="truncate whitespace-nowrap font-sans text-[10px] text-text-muted">
          {row.meta}
        </p>
      </div>
      <p
        className={cn(
          "shrink-0 whitespace-nowrap font-sans text-[10px] font-medium",
          isHigh ? "text-danger" : "text-[#cf821a]",
        )}
      >
        {row.age}
      </p>
    </div>
  );
}

function MLModelCard() {
  const stats = [
    { label: "ACTIVE MODEL", value: "Random Forest" },
    { label: "VERSION", value: "v1.4.2" },
    { label: "ACCURACY", value: "94.6%" },
    { label: "PERFORMANCE", value: "0.92 AUC-PR" },
  ];
  return (
    <Card growRatio={380} height={233} className="px-[22px] py-[18px]">
      <div className="flex w-full shrink-0 items-center gap-2.5 overflow-hidden">
        <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#dff5ec]">
          <Cpu className="size-4 text-[#3fa885]" strokeWidth={2} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
          <p className="truncate whitespace-nowrap font-sans text-[14px] font-bold text-text-primary">
            ML model
          </p>
          <span className="flex w-fit max-w-full items-center gap-1.5 overflow-hidden rounded-full bg-[#dff5ec] px-2 py-0.5">
            <span className="size-1.5 shrink-0 rounded-full bg-[#3fa885]" />
            <span className="truncate whitespace-nowrap font-sans text-[9px] font-bold tracking-[1.08px] text-[#3fa885]">
              PRIMARY · OPERATIONAL
            </span>
          </span>
        </div>
      </div>
      <div className="mt-3.5 flex w-full shrink-0 flex-col gap-3 overflow-hidden">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex w-full shrink-0 items-center overflow-hidden"
          >
            <p className="whitespace-nowrap font-sans text-[11px] font-medium text-text-muted">
              {s.label}
            </p>
            <div className="min-w-0 flex-1" />
            <p className="truncate whitespace-nowrap font-sans text-[12px] font-semibold text-text-primary">
              {s.value}
            </p>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-auto flex shrink-0 items-center gap-1.5 self-end overflow-hidden text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
      >
        <span className="whitespace-nowrap font-sans text-[12px] font-semibold">
          Open ML Config
        </span>
        <ArrowRight className="size-3 shrink-0" strokeWidth={2.4} />
      </button>
    </Card>
  );
}

/* ─── Shared list bits ──────────────────────────────────────────────── */

function CardHeader({
  title,
  subtitle,
  rightSlot,
}: {
  title: string;
  subtitle: string;
  rightSlot?: ReactNode;
}) {
  return (
    <div className="flex w-full shrink-0 items-center gap-2 overflow-hidden px-[22px] pb-3 pt-4">
      <div className="flex min-w-0 shrink flex-col gap-0.5 overflow-hidden whitespace-nowrap leading-none">
        <p className="truncate font-sans text-[14px] font-bold text-text-primary">
          {title}
        </p>
        <p className="truncate font-sans text-[11px] text-text-muted">
          {subtitle}
        </p>
      </div>
      <div className="min-w-0 flex-1" />
      {rightSlot ?? (
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 overflow-hidden text-brand-medium transition-transform duration-150 ease-out hover:translate-x-0.5"
        >
          <span className="whitespace-nowrap font-sans text-[11px] font-semibold">
            View all
          </span>
          <ArrowRight className="size-3 shrink-0" strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

function Divider({ tone }: { tone: "strong" | "soft" }) {
  return (
    <div
      className={cn(
        "h-px w-full shrink-0",
        tone === "strong" ? "bg-brand-cream-2" : "bg-[#f0e4d0]",
      )}
      aria-hidden
    />
  );
}
