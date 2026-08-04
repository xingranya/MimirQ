'use client'

import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type SettingsHelpTooltipProps = {
  label: string
  children: ReactNode
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export function SettingsHelpTooltip({
  label,
  children,
  className,
  side = 'top',
}: Readonly<SettingsHelpTooltipProps>) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(
              'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className
            )}
          >
            <HelpCircle className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          collisionPadding={12}
          className="max-w-[min(20rem,calc(100vw-2rem))] text-xs leading-5"
        >
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
