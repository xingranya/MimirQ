'use client'

import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const TONE_CLASSES = {
  neutral: 'border-primary/20 bg-primary/10 text-primary',
  success: 'border-success/20 bg-success/10 text-success',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive',
  info: 'border-info/20 bg-info/10 text-info',
} as const

export function SummaryStatCard({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  tone = 'neutral',
}: Readonly<{
  label: string
  value: string | number
  hint: string
  icon: LucideIcon
  delta?: { value: string; tone: 'up' | 'down' | 'neutral' }
  tone?: keyof typeof TONE_CLASSES
}>) {
  return (
    <div className="flex min-h-[88px] items-center gap-3 bg-card px-4 py-3">
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-md border', TONE_CLASSES[tone])}>
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-semibold leading-6 text-foreground tabular-nums">{value}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {delta?.value || hint}
        </p>
      </div>
    </div>
  )
}

export function DonutSummaryCard({
  title,
  subtitle,
  items,
  colors,
}: Readonly<{
  title: string
  subtitle?: string
  items: Array<{ label: string; value: number; hint?: string }>
  colors: string[]
}>) {
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <section className="h-full min-h-[178px] rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <span className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-foreground tabular-nums">
          共 {total} 条
        </span>
      </div>
      <dl className="mt-3 divide-y divide-border">
        {items.length ? (
          items.map((item, index) => (
            <div key={item.label} className="flex items-center justify-between gap-3 py-2 text-xs">
              <dt className="flex min-w-0 items-center gap-2 text-muted-foreground">
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: colors[index] }} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </dt>
              <dd className="shrink-0 text-foreground tabular-nums">
                {item.value}
                <span className="ml-1.5 text-muted-foreground">
                  {item.hint || `(${total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'}%)`}
                </span>
              </dd>
            </div>
          ))
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">暂无数据</div>
        )}
      </dl>
    </section>
  )
}

export function QuickActionCard({
  title,
  description,
  icon: Icon,
  onClick,
}: Readonly<{
  title: string
  description: string
  icon: LucideIcon
  onClick: () => void
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[64px] items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/25 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-1 block text-xs leading-4 text-muted-foreground">{description}</span>
      </span>
    </button>
  )
}
