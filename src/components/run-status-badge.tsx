import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgentRunStatus } from "@/types/trace";

export function RunStatusBadge({ status }: { status: AgentRunStatus }) {
  if (status === "failed") {
    return <Badge variant="danger"><XCircle size={12} /> Failed</Badge>;
  }
  if (status === "suspicious") {
    return <Badge variant="warning"><AlertTriangle size={12} /> Suspicious</Badge>;
  }
  return <Badge variant="success"><CheckCircle2 size={12} /> Success</Badge>;
}
