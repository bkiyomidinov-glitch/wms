import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-[#E2E8F0] bg-[#F8FAFC] text-[#0F172A]",
        red: "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]",
        inbound: "border-[#BBF7D0] bg-[#F0FDF4] text-[#16A34A]",
        outbound: "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]",
        danger: "border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]",
        blue: "border-[#BAE6FD] bg-[#F0F9FF] text-[#0284C7]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
