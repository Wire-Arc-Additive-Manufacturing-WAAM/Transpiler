import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 min-h-11 px-5",
  {
    variants: {
      variant: {
        default: "bg-brand-green text-white hover:bg-brand-green/90",
        secondary: "bg-amber-500 text-white hover:bg-amber-600",
        outline:
          "border-2 border-brand-green text-brand-green hover:bg-brand-green/5",
        ghost: "text-brand-green hover:bg-brand-green/10",
      },
      size: {
        default: "py-2.5",
        sm: "min-h-9 rounded-lg px-3 text-xs",
        lg: "min-h-12 rounded-xl px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
