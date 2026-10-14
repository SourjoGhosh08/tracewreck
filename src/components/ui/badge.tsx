import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide", {
  variants: {
    variant: {
      default: "border-violet-400/20 bg-violet-400/10 text-violet-300",
      success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
      danger: "border-red-400/20 bg-red-400/10 text-red-300",
      muted: "border-slate-700 bg-slate-800/60 text-slate-400",
      warning: "border-amber-400/20 bg-amber-400/10 text-amber-300"
    }
  },
  defaultVariants: { variant: "default" }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
