import { SearchX } from "lucide-react";
import { Card } from "@/components/ui/card";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <Card className="flex min-h-64 flex-col items-center justify-center border-dashed p-8 text-center"><span className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-slate-800/70 text-slate-500"><SearchX size={20} /></span><h3 className="text-sm font-semibold text-slate-200">{title}</h3><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>{action ? <div className="mt-5">{action}</div> : null}</Card>;
}
