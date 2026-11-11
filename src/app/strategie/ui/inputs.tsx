"use client";

import { useState } from "react";
import { parseNumber } from "@/lib/os/finder";

export const inputClass = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

const show = (v: number | undefined, digits: number) => (v == null || !Number.isFinite(v) ? "" : v.toLocaleString("de-DE", { maximumFractionDigits: digits, useGrouping: false }));

// Number input in German format ("12,5"); `scale` converts e.g. decimals to percent.
export function NumInput({ value, onChange, scale = 1, digits = 4, placeholder, className = "" }: { value?: number; onChange: (v: number | undefined) => void; scale?: number; digits?: number; placeholder?: string; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      inputMode="decimal"
      value={draft ?? show(value == null ? undefined : value * scale, digits)}
      placeholder={placeholder}
      onFocus={(e) => setDraft(e.target.value)}
      onChange={(e) => {
        // keep the typed text, but pass every parsable value on immediately
        setDraft(e.target.value);
        const n = parseNumber(e.target.value.replace("%", ""));
        onChange(n == null ? undefined : n / scale);
      }}
      onBlur={() => setDraft(null)}
      className={`${inputClass} tabular-nums ${className}`}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

export const buttonClass = "rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-border/40 disabled:opacity-40";
export const primaryButtonClass = "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40";

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}`);
export const today = () => new Date().toISOString().slice(0, 10);
export const nowIso = () => new Date().toISOString();

export function fmtDate(iso?: string) {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtAge(iso?: string) {
  if (!iso) return "ohne Stand";
  const d = new Date(iso);
  return `Stand ${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
}
