"use client";

import { Monitor, Smartphone } from "lucide-react";

const STORAGE_KEY = "expense-view-mode";
export type ViewMode = "mobile" | "desktop";

// Runs before React hydrates so the correct tree paints on first frame (no
// flash). Sets html[data-view] from localStorage; defaults to "mobile" so the
// breakpoint-driven behavior is unchanged when nothing is stored.
export function ViewModeScript() {
  const code = `(function(){try{var v=localStorage.getItem('${STORAGE_KEY}');document.documentElement.dataset.view=v==='desktop'?'desktop':'mobile';}catch(e){document.documentElement.dataset.view='mobile';}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

// Persist the choice and flip html[data-view]; the CSS override in globals.css
// swaps the visible tree. No React state is needed — visibility is attribute-
// driven, so the change applies to the already-rendered trees immediately.
function setViewMode(next: ViewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore storage failures (private mode, etc.)
  }
  document.documentElement.dataset.view = next;
}

// Shown in the mobile top bar. Switches to the desktop layout.
export function SwitchToDesktopButton() {
  return (
    <button
      type="button"
      onClick={() => setViewMode("desktop")}
      className="flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-[var(--m-border-strong)] bg-white px-2.5 text-[12px] font-bold text-[var(--m-text-secondary)]"
      aria-label="Switch to desktop view"
    >
      <Monitor className="h-3.5 w-3.5" />
      Desktop
    </button>
  );
}

// Shown in the desktop header only when the desktop view is being forced onto a
// small screen (visible via CSS below md). Switches back to the mobile layout.
export function SwitchToMobileButton() {
  return (
    <button
      type="button"
      onClick={() => setViewMode("mobile")}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium md:hidden"
      aria-label="Switch to mobile view"
    >
      <Smartphone className="h-3.5 w-3.5" />
      Mobile view
    </button>
  );
}
