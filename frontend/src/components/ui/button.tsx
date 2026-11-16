import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[#DC2626] text-white hover:bg-[#B91C1C] shadow-xs",
        inbound: "bg-[#16A34A] text-white hover:bg-[#15803D] shadow-xs",
        outbound: "bg-[#DC2626] text-white hover:bg-[#B91C1C] shadow-xs",
        destructive: "bg-[#EF4444] text-white hover:bg-[#DC2626] shadow-xs",
        outline: "border border-[#E2E8F0] bg-white text-[#0F172A] hover:bg-[#F8FAFC]",
        ghost: "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 text-base font-semibold",
        xl: "h-14 px-8 text-base font-semibold",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
