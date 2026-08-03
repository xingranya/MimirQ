import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const panelVariants = cva(
  "flex flex-col rounded-lg border border-border text-card-foreground",
  {
    variants: {
      variant: {
        default: "bg-card",
        muted: "bg-muted/35",
        glass: "bg-card",
        seamless:
          "rounded-none border-x-0 border-t-0 border-b border-border/70 bg-background shadow-none transition-none",
      },
      padding: {
        none: "p-0",
        sm: "p-3",
        md: "p-4",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
    },
  }
)

export interface PanelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof panelVariants> {}

export function Panel({ className, variant, padding, ...props }: Readonly<PanelProps>) {
  return <div className={cn(panelVariants({ variant, padding }), className)} {...props} />
}
