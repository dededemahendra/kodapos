import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "~/lib/utils"

// Embossed outline surface: a soft vertical gradient, a top inner highlight, a
// 1px ring acting as the border, and a drop shadow for lift. Derived from the
// Figma spec; pressing nudges it down a pixel and softens the shadow. Colors are
// driven by theme tokens (--card → --background surface, --accent hover) so the
// button tints with the active theme instead of fixed neutral grays — under
// Cosmic Night it reads violet, not near-black. The 1px ring uses a neutral dark
// hairline in light mode (the --border token is too pale to read against the
// near-white --card surface) and the --border token in dark mode (where it reads
// clearly against the dark card). Radius is left to the base class so this never
// changes rounding.
const grayEmboss =
  "bg-gradient-to-b from-[var(--card)] to-[var(--background)] text-foreground " +
  "hover:from-[var(--accent)] hover:to-[var(--accent)] hover:text-accent-foreground " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),0_2px_3px_-1px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.12)] " +
  "active:translate-y-px active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4),0_1px_2px_-1px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.12)] " +
  "dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_2px_3px_-1px_rgba(0,0,0,0.5),0_0_0_1px_var(--border)] " +
  "dark:active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_1px_2px_-1px_rgba(0,0,0,0.5),0_0_0_1px_var(--border)]"

// Secondary shares the embossed lift but is driven by the --secondary token
// instead of fixed neutral grays, so it tints with the active theme (violet
// under Cosmic Night) in both light and dark rather than rendering near-black.
const secondaryEmboss =
  "bg-secondary text-secondary-foreground hover:bg-secondary/80 " +
  "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6),0_2px_3px_-1px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] " +
  "active:translate-y-px active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5),0_1px_2px_-1px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.06)] " +
  "dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_2px_3px_-1px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.06)] " +
  "dark:active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_2px_-1px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.06)]"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 " +
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_2px_3px_-1px_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.1)] " +
          "active:translate-y-px active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_1px_2px_-1px_rgba(0,0,0,0.3),0_0_0_1px_rgba(0,0,0,0.1)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 " +
          "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2),0_2px_3px_-1px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.08)] " +
          "active:translate-y-px active:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_1px_2px_-1px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.08)]",
        outline: grayEmboss,
        secondary: secondaryEmboss,
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
