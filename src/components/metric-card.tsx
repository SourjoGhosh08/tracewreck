import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function MetricCard({ label, value, detail, icon: Icon, tone = "violet" }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: "violet" | "emerald" | "red" | "amber" }) {
  const tones = { violet: "bg-violet-400/10 text-violet-300", emerald: "bg-emerald-400/10 text-emerald-300", red: "bg-red-400/10 text-red-300", amber: "bg-amber-400/10 text-amber-300" };
  return <Card className="relative overflow-hidden p-4"><div className={cn("mb-5 flex h-8 w-8 items-center justify-center rounded-lg", tones[tone])}><Icon size={16} /></div><p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">{value}</p><p className="mt-1 text-xs text-slate-600">{detail}</p></Card>;
}
