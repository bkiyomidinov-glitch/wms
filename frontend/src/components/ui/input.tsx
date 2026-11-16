import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md border border-[#E2E8F0] bg-white px-3 py-2 text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:border-[#DC2626] disabled:cursor-not-allowed disabled:bg-[#F1F5F9] disabled:opacity-70",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";
