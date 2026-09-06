"use client";

import { useEffect } from "react";

export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="m-anim-overlay absolute inset-0 cursor-pointer border-0"
        style={{ background: "rgba(20,19,15,0.4)" }}
      />
      <div
        className="m-anim-sheet relative flex max-h-[88%] flex-col gap-4 overflow-y-auto px-5 pt-3.5 pb-6"
        style={{
          background: "var(--m-canvas)",
          borderRadius: "28px 28px 36px 36px",
        }}
      >
        <div className="h-1 w-10 self-center rounded-full bg-[#ddd9d3]" />
        <span className="text-[18px] font-extrabold text-[var(--m-ink)]">
          {title}
        </span>
        {children}
      </div>
    </div>
  );
}
