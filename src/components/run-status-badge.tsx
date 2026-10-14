import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function RunStatusBadge({ status }: { status: "completed" | "failed" }) {
  return <Badge variant={status === "completed" ? "success" : "danger"}>{status === "completed" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}{status === "completed" ? "Completed" : "Failed"}</Badge>;
}
