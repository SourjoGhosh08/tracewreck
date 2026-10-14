"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function Tabs({ value, defaultValue, onValueChange, children, className }: { value?: string; defaultValue?: string; onValueChange?: (value: string) => void; children: React.ReactNode; className?: string }) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "");
  const currentValue = value ?? internalValue;
  return <TabsContext.Provider value={{ value: currentValue, onValueChange: (next) => { setInternalValue(next); onValueChange?.(next); } }}><div className={className}>{children}</div></TabsContext.Provider>;
}

function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("inline-flex h-9 items-center rounded-lg border border-white/[0.08] bg-slate-950/60 p-1", className)}>{children}</div>;
}

function TabsTrigger({ value, children, disabled = false }: { value: string; children: React.ReactNode; disabled?: boolean }) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used inside Tabs");
  const active = context.value === value;
  return <button type="button" disabled={disabled} onClick={() => context.onValueChange(value)} className={cn("relative h-7 rounded-md px-3 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-60", active && "bg-white/[0.08] text-slate-100 shadow-sm")}>{children}</button>;
}

function TabsContent({ value, children, className }: { value: string; children: React.ReactNode; className?: string }) {
  const context = React.useContext(TabsContext);
  if (!context || context.value !== value) return null;
  return <div className={className}>{children}</div>;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
