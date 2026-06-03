/**
 * Shared "scaffold" body for routes whose chrome (sidebar entry + topbar
 * title/subtitle) is wired but whose interior is still pending. The page
 * chrome (Sidebar / Topbar) lives in RootLayout — this component only
 * renders the empty <main> body, centered, matching the brand visual.
 *
 * Replace each call site with a real implementation as the page is built.
 */
export function PlaceholderPage({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="font-sans text-[14px] font-bold tracking-[1.76px] text-brand-medium">
          {label.toUpperCase()}
        </p>
        <p className="font-sans text-[13px] text-text-muted">
          Production build pending.
        </p>
      </div>
    </div>
  );
}
