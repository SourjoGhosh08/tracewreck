"use client";

import { Braces, ChevronDown, Copy, Check } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn, prettyJson } from "@/lib/utils";

export function JsonViewer({ label, value, defaultOpen = false, className }: { label: string; value: unknown; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const panelId = useId();
  const serialized = typeof value === "string" ? JSON.stringify(value, null, 2) : prettyJson(value);
  const copy = async () => {
    await navigator.clipboard?.writeText(serialized);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return <div className={cn("overflow-hidden rounded-lg border border-white/[0.07] bg-[#080b12]/70", className)}><div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2"><button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={panelId} className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200"><ChevronDown size={14} className={cn("transition-transform", !open && "-rotate-90")} /><Braces size={13} className="text-violet-300" />{label}</button><Button type="button" variant="ghost" size="icon" aria-label={`Copy ${label}`} onClick={copy} className="h-6 w-6">{copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}</Button></div>{open ? <pre id={panelId} className="max-h-72 overflow-auto p-3 font-mono text-[11px] leading-5 text-slate-400">{serialized}</pre> : null}</div>;
}
