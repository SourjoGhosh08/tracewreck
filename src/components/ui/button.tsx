import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-violet-500 text-white shadow-lg shadow-violet-500/15 hover:bg-violet-400",
        secondary: "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]",
        ghost: "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100",
        outline: "border border-slate-700 bg-transparent text-slate-300 hover:border-slate-600 hover:bg-white/[0.04]",
        danger: "border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15"
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded px-2.5 text-xs",
        lg: "h-11 px-5",
        icon: "h-9 w-9"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = "Button";

export { Button, buttonVariants };
