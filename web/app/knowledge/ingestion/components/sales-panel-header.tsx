'use client'

import { ChevronRight, LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type SalesPanelHeaderProps = {
  actionLabel?: string
  icon: LucideIcon
  iconTone?: string
  onAction?: () => void
  subtitle?: string
  title: string
}

export function SalesPanelHeader({
  actionLabel,
  icon: Icon,
  iconTone = 'text-muted-foreground/65',
  onAction,
  subtitle,
  title,
}: Readonly<SalesPanelHeaderProps>) {
  return (
    <div className="flex min-h-8 items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex min-h-5 items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className={cn('size-4 shrink-0', iconTone)} aria-hidden="true" />
          <span className="truncate">{title}</span>
        </div>
        {subtitle ? (
          <div className="mt-1 pl-6 text-xs leading-5 text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary transition-colors hover:bg-muted"
        >
          <span>{actionLabel}</span>
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
