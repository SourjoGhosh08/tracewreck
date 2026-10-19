import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Beaker,
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  Command,
  GitBranch,
  History,
  Play,
  ScanSearch,
  ShieldCheck,
  Terminal,
  Upload,
  Workflow,
  X
} from "lucide-react";

const failedDemoHref = "/runs/run_support_refund_damaged_headphones_failed";

const executionPath = [
  { label: "user_request", detail: "Damaged headphones", icon: Terminal, tone: "text-sky-300" },
  { label: "agent_plan", detail: "Find matching order", icon: Workflow, tone: "text-violet-300" },
  { label: "retrieval", detail: "2 records found", icon: ScanSearch, tone: "text-fuchsia-300" },
  { label: "model_call", detail: "Select order", icon: Code2, tone: "text-amber-300", fault: true },
  { label: "tool_call", detail: "Issue refund", icon: Activity, tone: "text-orange-300" },
  { label: "final_response", detail: "Wrong outcome", icon: X, tone: "text-red-300" }
];

const workflow = [
  {
    number: "01",
    title: "Record",
    description: "Capture every request, model decision, retrieval, tool call, and outcome in one ordered trace.",
    icon: History,
    tone: "text-sky-300"
  },
  {
    number: "02",
    title: "Investigate",
    description: "Follow the execution path and inspect the recorded step where behavior became suspicious.",
    icon: ScanSearch,
    tone: "text-violet-300"
  },
  {
    number: "03",
    title: "Review",
    description: "Turn the trace into a reviewable report with evidence, impact, and a clearly labeled hypothesis.",
    icon: ShieldCheck,
    tone: "text-amber-300"
  },
  {
    number: "04",
    title: "Simulate",
    description: "Compare one local guardrail against the recorded path before shipping a change.",
    icon: Beaker,
    tone: "text-emerald-300"
  }
];

function BrandMark() {
  return <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-300/25 bg-violet-400/15 text-violet-200"><Command size={16} strokeWidth={2.5} /></span>;
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300"><span className="h-px w-5 bg-violet-400/60" />{children}</p>;
}

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-[#070a10] text-slate-200">
      <header className="relative z-10 border-b border-white/[0.07] bg-[#070a10]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" className="group flex items-center gap-3" aria-label="TraceWreck home">
            <BrandMark />
            <span className="text-sm font-semibold tracking-tight text-slate-100">TraceWreck</span>
          </Link>
          <nav className="hidden items-center gap-7 text-xs text-slate-500 md:flex" aria-label="Landing page">
            <a href="#product" className="transition-colors hover:text-slate-200">Product</a>
            <a href="#method" className="transition-colors hover:text-slate-200">Method</a>
            <a href="#boundary" className="transition-colors hover:text-slate-200">Evidence model</a>
          </nav>
          <Link href="/app" className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-violet-300/35 hover:bg-violet-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70">
            Open dashboard <ArrowRight size={14} />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative border-b border-white/[0.07]">
           <div className="relative mx-auto grid max-w-7xl gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:px-10 lg:pb-28">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-violet-200"><CircleDot size={12} className="text-violet-300" /> Flight recorder for AI agents</div>
              <h1 className="max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] text-slate-50 sm:text-6xl lg:text-[4.7rem]">Debug the path.<br /><span className="text-slate-500">Not just the output.</span></h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">TraceWreck makes agent failures inspectable. See what your agent observed, decided, and did—then separate recorded facts from the story you think explains them.</p>
              <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link href="/app" className="inline-flex h-11 items-center gap-2 rounded-md bg-violet-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80">Explore recorded runs <ArrowRight size={16} /></Link>
                <Link href="/app/import" className="inline-flex h-11 items-center gap-2 rounded-md border border-sky-300/25 bg-sky-300/[0.06] px-5 text-sm font-medium text-sky-100 transition-colors hover:border-sky-200/45 hover:bg-sky-300/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"><Upload size={15} className="text-sky-300" /> Import your own trace</Link>
                <Link href={failedDemoHref} className="inline-flex h-11 items-center gap-2 rounded-md border border-white/10 px-5 text-sm font-medium text-slate-300 transition-colors hover:border-red-300/35 hover:bg-red-400/[0.06] hover:text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"><Play size={15} className="text-red-300" /> Inspect a failed run</Link>
              </div>
               <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-600"><span className="flex items-center gap-2"><Check size={13} className="text-emerald-400" /> Ordered execution traces</span><span className="flex items-center gap-2"><Check size={13} className="text-emerald-400" /> Evidence-first reviews</span><span className="flex items-center gap-2"><Check size={13} className="text-emerald-400" /> Local counterfactuals</span></div>
            </div>

            <div className="relative mx-auto w-full max-w-[540px] lg:ml-auto" aria-label="Example TraceWreck trace preview">
               <div className="relative rounded-xl border border-white/[0.1] bg-[#0b1019] p-3">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-2 pb-3"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.7)]" /><span className="font-mono text-[11px] text-slate-300">run_support_refund_..._failed</span></div><span className="rounded border border-red-400/20 bg-red-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-red-300">failed</span></div>
                <div className="grid grid-cols-[110px_1fr] gap-3 px-2 py-4 font-mono text-[10px] sm:grid-cols-[132px_1fr]"><div className="space-y-3 border-r border-white/[0.06] pr-3 text-slate-600"><div>AGENT</div><div>MODEL</div><div>STEPS</div><div>FAULT</div><div>IMPACT</div></div><div className="space-y-3 text-slate-400"><div className="text-slate-200">SupportRefund Agent <span className="text-slate-600">v1.4.0</span></div><div>gpt-4o-mini</div><div>12 normalized events</div><div className="text-red-300">wrong_order_selection <span className="text-red-300/50">@ step_07</span></div><div className="text-amber-200/80">Wrong order · $12 refund</div></div></div>
                 <div className="rounded-lg border border-red-400/20 bg-red-400/[0.045] p-3"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-300"><GitBranch size={13} /> Demo fixture annotation</div><p className="mt-2 text-xs leading-5 text-slate-300">Select order to refund</p><p className="mt-1 font-mono text-[10px] leading-5 text-slate-500">Synthetic marker: 847219 was selected without recorded confirmation.</p></div>
                <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] px-1 pt-3 text-[10px] text-slate-600"><span>Recorded evidence · no causal inference</span><span className="flex items-center gap-1 text-violet-300">View trace <ChevronRight size={12} /></span></div>
              </div>
              <div className="absolute -bottom-6 -left-5 hidden rounded-lg border border-white/[0.1] bg-[#0c121d] px-3 py-2 shadow-xl sm:block"><p className="font-mono text-[9px] uppercase tracking-wider text-slate-600">downstream steps</p><p className="mt-1 text-xs text-slate-300">4 affected actions</p></div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/[0.07] bg-[#090d15]" aria-labelledby="execution-path-title">
          <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-16">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><SectionEyebrow>Execution path</SectionEyebrow><h2 id="execution-path-title" className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">A failure is a sequence, not a screenshot.</h2></div><p className="max-w-sm text-sm leading-6 text-slate-500">Keep the context around the bad answer. TraceWreck preserves the path that produced it.</p></div>
             <div className="mt-9 overflow-x-auto pb-2"><div className="flex min-w-[760px] items-start">{executionPath.map((step, index) => { const Icon = step.icon; return <div key={step.label} className="flex min-w-[126px] flex-1 items-start"><div className="relative w-full"><div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-lg border bg-[#0d1420] ${step.fault ? "border-red-400/50 text-red-300" : "border-white/10 " + step.tone}`}><Icon size={16} /></div>{index < executionPath.length - 1 ? <span className="absolute left-10 right-0 top-5 h-px bg-white/15" /> : null}<div className="mt-4 pr-4"><p className={`font-mono text-[10px] ${step.fault ? "text-red-300" : "text-slate-500"}`}>{step.label}</p><p className="mt-1 text-xs text-slate-300">{step.detail}</p>{step.fault ? <span className="mt-2 inline-flex rounded border border-red-400/20 bg-red-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-red-300">demo annotation</span> : null}</div></div></div>; })}</div></div>
          </div>
        </section>

        <section id="product" className="mx-auto max-w-7xl scroll-mt-10 px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20"><div><SectionEyebrow>Product preview</SectionEyebrow><h2 className="max-w-lg text-3xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-4xl">The debugger for the moments after “it went wrong.”</h2><p className="mt-5 max-w-md text-sm leading-6 text-slate-500">Start with the exact run. Move from timeline to decision graph to root-cause review without losing the raw inputs and outputs that make the investigation trustworthy.</p><Link href="/app" className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70">Browse the run workspace <ArrowRight size={15} /></Link></div>
            <div className="rounded-xl border border-white/[0.1] bg-[#0b1019] p-3"><div className="flex items-center gap-2 border-b border-white/[0.07] px-3 pb-3"><span className="h-2 w-2 rounded-full bg-violet-300" /><span className="text-xs font-medium text-slate-200">SupportRefund Agent</span><span className="font-mono text-[10px] text-slate-600">/ run detail</span><span className="ml-auto rounded border border-red-400/20 bg-red-400/10 px-2 py-1 text-[9px] uppercase tracking-wider text-red-300">failed</span></div><div className="grid gap-3 p-2 sm:grid-cols-[0.92fr_1.08fr]"><div className="rounded-lg border border-white/[0.07] bg-black/10 p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Timeline</span><span className="font-mono text-[9px] text-slate-600">12 steps</span></div><div className="mt-4 space-y-2.5">{["Receive user request", "Retrieve order history", "Select order to refund", "Issue incorrect refund", "Return outcome"].map((label, index) => <div key={label} className="flex items-center gap-2.5"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${index === 2 ? "border-red-400/45 bg-red-400/10 text-red-300" : "border-white/10 bg-white/[0.03] text-slate-600"}`}>{index === 2 ? <X size={10} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}</span><span className={`truncate text-[10px] ${index === 2 ? "text-red-200" : "text-slate-500"}`}>{label}</span></div>)}</div></div><div className="rounded-lg border border-white/[0.07] bg-black/10 p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Decision graph</span><span className="flex items-center gap-1 font-mono text-[9px] text-violet-300"><GitBranch size={11} /> graph</span></div><div className="relative mt-4 h-40 overflow-hidden rounded border border-white/[0.05] bg-[#080d15] p-3"><div className="absolute left-[24%] top-[20%] h-px w-[22%] rotate-[22deg] bg-sky-300/40" /><div className="absolute left-[45%] top-[38%] h-px w-[25%] -rotate-[18deg] bg-red-300/45" /><div className="absolute left-[43%] top-[57%] h-px w-[25%] rotate-[18deg] bg-red-300/25" /><div className="absolute left-[68%] top-[39%] h-px w-[18%] rotate-[62deg] bg-orange-300/25" /><span className="absolute left-[10%] top-[13%] h-6 w-6 rounded-md border border-sky-300/35 bg-sky-300/10" /><span className="absolute left-[38%] top-[32%] h-7 w-7 rounded-md border border-red-300/55 bg-red-300/15" /><span className="absolute left-[67%] top-[25%] h-6 w-6 rounded-md border border-orange-300/35 bg-orange-300/10" /><span className="absolute left-[67%] top-[64%] h-6 w-6 rounded-md border border-red-300/25 bg-red-300/10" /><span className="absolute bottom-[11%] left-[38%] h-6 w-6 rounded-md border border-slate-300/20 bg-white/[0.05]" /></div><p className="mt-3 text-[10px] leading-4 text-slate-600">Parent relationships plus optional inferred execution order.</p></div></div><div className="flex flex-wrap gap-2 px-2 pb-1 text-[9px] text-slate-600"><span className="rounded border border-white/[0.07] px-2 py-1">12 normalized events</span><span className="rounded border border-red-400/15 px-2 py-1 text-red-300/80">annotation shown</span><span className="rounded border border-violet-300/15 px-2 py-1 text-violet-300/80">evidence linked</span></div></div>
          </div>
        </section>

        <section id="method" className="scroll-mt-10 border-y border-white/[0.07] bg-[#090d15]" aria-labelledby="method-title"><div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24"><div className="max-w-xl"><SectionEyebrow>Method</SectionEyebrow><h2 id="method-title" className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">From raw trace to safer next step.</h2><p className="mt-4 text-sm leading-6 text-slate-500">A focused workflow for engineers who need to explain a behavior before they change it.</p></div><div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">{workflow.map((step) => { const Icon = step.icon; return <article key={step.number} className="bg-[#0b1019] p-6"><div className="flex items-center justify-between"><span className="font-mono text-[10px] text-slate-600">{step.number}</span><Icon size={17} className={step.tone} /></div><h3 className="mt-9 text-base font-semibold text-slate-100">{step.title}</h3><p className="mt-3 text-xs leading-5 text-slate-500">{step.description}</p></article>; })}</div></div></section>

        <section id="boundary" className="mx-auto max-w-7xl scroll-mt-10 px-5 py-20 sm:px-8 lg:px-10 lg:py-28" aria-labelledby="boundary-title"><div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20"><div><SectionEyebrow>Truth boundary</SectionEyebrow><h2 id="boundary-title" className="text-3xl font-semibold leading-tight tracking-tight text-slate-100 sm:text-4xl">Make the line between what happened and what you think visible.</h2><p className="mt-5 max-w-md text-sm leading-6 text-slate-500">Debugging gets safer when the tool does not quietly turn a plausible explanation into a fact.</p></div><div className="grid gap-3"><article className="rounded-lg border border-sky-300/15 bg-sky-300/[0.035] p-5 sm:flex sm:items-start sm:gap-5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-sky-300/20 bg-sky-300/10 text-sky-300"><History size={16} /></div><div className="mt-4 sm:mt-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-100">Recorded facts</h3><span className="rounded border border-sky-300/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-sky-300">observed</span></div><p className="mt-2 text-xs leading-5 text-slate-500">Inputs, outputs, timestamps, tool arguments, statuses, and relationships copied from the trace. The source of truth for an investigation.</p></div></article><article className="rounded-lg border border-amber-300/15 bg-amber-300/[0.035] p-5 sm:flex sm:items-start sm:gap-5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-300/20 bg-amber-300/10 text-amber-300"><ScanSearch size={16} /></div><div className="mt-4 sm:mt-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-100">Hypotheses</h3><span className="rounded border border-amber-300/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300">inferred</span></div><p className="mt-2 text-xs leading-5 text-slate-500">Candidate explanations tied back to the evidence: the first divergence, its downstream impact, and what should be reviewed next.</p></div></article><article className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.035] p-5 sm:flex sm:items-start sm:gap-5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-300/20 bg-emerald-300/10 text-emerald-300"><Beaker size={16} /></div><div className="mt-4 sm:mt-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-100">Counterfactual simulations</h3><span className="rounded border border-emerald-300/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">what-if</span></div><p className="mt-2 text-xs leading-5 text-slate-500">A proposed change replayed as a separate scenario. Useful for deciding what might have happened—not evidence that it did.</p></div></article></div></div></section>

         <section className="border-t border-white/[0.07] bg-[#090d15]"><div className="mx-auto flex max-w-7xl flex-col gap-7 px-5 py-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-violet-300">Start with the trace</p><h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Review the suspicious step before you rewrite the whole agent.</h2></div><div className="flex flex-col gap-3 sm:flex-row"><Link href="/app" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-violet-500 px-5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80">Open dashboard <ArrowRight size={16} /></Link><Link href={failedDemoHref} className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-white/10 px-5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70">Read the failed demo <ChevronRight size={15} /></Link></div></div></section>
      </main>
      <footer className="border-t border-white/[0.07] bg-[#070a10]"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><Link href="/" className="flex items-center gap-2 text-slate-400"><BrandMark /><span>TraceWreck</span></Link><p>Inspect the path. Label the uncertainty. Change with evidence.</p><Link href="/app" className="text-slate-500 transition-colors hover:text-slate-200">Open workspace <ArrowRight size={12} className="ml-1 inline" /></Link></div></footer>
    </div>
  );
}
