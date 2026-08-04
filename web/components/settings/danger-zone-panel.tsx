'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, ChevronDown, CircleHelp } from 'lucide-react'

import { cn } from '@/lib/utils'

type DangerZonePanelProps = {
  title: string
  impact: string
  badge?: string
  children: ReactNode
  className?: string
  compact?: boolean
  tone?: 'danger' | 'neutral'
  icon?: 'alert' | 'help'
}

export function DangerZonePanel({
  title,
  impact,
  badge = '危险维护',
  children,
  className,
  compact = false,
  tone = 'danger',
  icon = 'alert',
}: Readonly<DangerZonePanelProps>) {
  const isNeutral = tone === 'neutral'
  const Icon = icon === 'help' ? CircleHelp : AlertTriangle

  return (
    <details
      data-testid="danger-zone-panel"
      className={cn(
        'group rounded-lg border p-0',
        isNeutral
          ? 'border-border bg-background'
          : 'border-destructive/25 bg-destructive/[0.03]',
        className
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none justify-between gap-3 marker:hidden',
          compact ? 'items-center px-2.5 py-2' : 'items-start px-3 py-2.5'
        )}
      >
        <div className={cn('flex min-w-0', compact ? 'gap-2' : 'gap-2.5')}>
          <div
            className={cn(
              'shrink-0 items-center justify-center rounded-md',
              isNeutral
                ? 'border border-primary/20 bg-primary/10 text-primary'
                : 'border border-destructive/20 bg-destructive/10 text-destructive',
              compact ? 'mt-0 flex size-6' : 'mt-0.5 flex size-7'
            )}
          >
            <Icon className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          </div>
          <div className="min-w-0">
            <div className={cn('flex flex-wrap items-center', compact ? 'gap-1.5' : 'gap-2')}>
              <span
                className={cn(
                  'font-medium text-foreground',
                  compact ? 'text-xs' : 'text-sm'
                )}
              >
                {title}
              </span>
              <span
                className={cn(
                  'rounded-md bg-background font-medium',
                  isNeutral
                    ? 'border border-border/60 text-muted-foreground'
                    : 'border border-destructive/20 text-destructive',
                  'px-1.5 py-0.5 text-xs'
                )}
              >
                {badge}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {impact}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn(
            'shrink-0 text-muted-foreground transition-transform group-open:rotate-180',
            compact ? 'mt-0 h-3.5 w-3.5' : 'mt-1 h-4 w-4'
          )}
          aria-hidden="true"
        />
      </summary>
      <div
        className={cn(
          'px-3 pb-3 pt-3',
          isNeutral
            ? 'border-t border-border bg-background'
            : 'border-t border-destructive/15 bg-background'
        )}
      >
        {children}
      </div>
    </details>
  )
}
