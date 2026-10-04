import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "uv-btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "brand-gradient shadow-brand hover:brightness-110 hover:-translate-y-px active:translate-y-0 active:scale-[0.99]",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background hover:border-primary/30 hover:bg-brand-soft",
        secondary: "bg-secondary text-secondary-foreground hover:bg-brand-soft",
        soft: "bg-brand-soft text-primary hover:bg-primary hover:text-primary-foreground",
        dark: "bg-brand-dark text-primary-foreground hover:bg-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        nav: "my-2 h-auto flex-col gap-1 rounded-[20px] text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground",
        navActive:
          "my-2 h-auto flex-col gap-1 rounded-[20px] bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)] hover:bg-primary/20 [&_svg]:text-primary [&_svg]:drop-shadow-[0_0_8px_var(--primary)]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        touch: "min-h-14 rounded-2xl px-6 text-base",
        iconLg: "size-12 rounded-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
