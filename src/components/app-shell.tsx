import Link from "next/link";
import { Activity, ChevronDown, Command, Settings2 } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080b12] text-slate-200">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#080b12]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-8">
            <Link href="/" className="group flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500 text-white shadow-lg shadow-violet-500/20"><Command size={16} strokeWidth={2.5} /></span>
              <span className="hidden text-sm font-semibold tracking-tight text-slate-100 sm:block">TraceWreck</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <Link href="/app" className="rounded-md bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-slate-100">Runs</Link>
              <button type="button" className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"><Activity size={14} /> Agents <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">Soon</span></button>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden items-center gap-2 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> Local database connected</span>
            <button type="button" aria-label="Open settings" className="rounded-md p-2 text-slate-500 hover:bg-white/[0.06] hover:text-slate-300"><Settings2 size={16} /></button>
            <button type="button" className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-slate-400 hover:bg-white/[0.06]"><span className="flex h-5 w-5 items-center justify-center rounded bg-amber-400/15 text-[10px] font-bold text-amber-300">D</span> Developer <ChevronDown size={13} /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-5 py-8 lg:px-8 lg:py-10">{children}</main>
    </div>
  );
}
