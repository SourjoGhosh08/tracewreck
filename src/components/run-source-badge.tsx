import { Database, Upload } from "lucide-react";
import type { AgentRunSource } from "@/types/trace";

export function RunSourceBadge({ source }: { source: AgentRunSource }) {
  const imported = source === "imported";
  const Icon = imported ? Upload : Database;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${imported ? "border-sky-400/25 bg-sky-400/10 text-sky-300" : "border-violet-400/25 bg-violet-400/10 text-violet-300"}`}>
      <Icon size={12} aria-hidden="true" />
      {imported ? "Imported trace" : "Demo fixture"}
    </span>
  );
}
