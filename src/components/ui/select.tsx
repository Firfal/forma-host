import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Liste déroulante native, au style des champs de saisie. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border border-line bg-white px-2.5 text-sm text-ink focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-brand-logo/25 disabled:bg-surface disabled:text-muted",
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = "Select";
