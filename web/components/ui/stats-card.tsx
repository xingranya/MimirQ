'use client'

import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  subValue?: string
  unit?: string
  dot?: 'success' | 'warning' | 'destructive' | 'info' | 'pulse'
  dim?: boolean
  onClick?: () => void
  active?: boolean
  color?: 'amber' | 'blue' | 'green' | 'teal' | 'orange' | 'red' | 'gray' | 'cyan' | 'sky' | 'rose' | 'indigo'
  className?: string
  dense?: boolean
}

const dotStyles: Record<NonNullable<StatCardProps['dot']>, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
  pulse: 'bg-info animate-pulse',
}

const valueColorStyles: Record<NonNullable<StatCardProps['color']>, string> = {
  amber: 'text-warning',
  blue: 'text-info',
  green: 'text-success',
  teal: 'text-success',
  orange: 'text-warning',
  red: 'text-destructive',
  gray: 'text-foreground',
  cyan: 'text-info',
  sky: 'text-info',
  rose: 'text-destructive',
  indigo: 'text-primary',
}

const iconTextStyles: Record<NonNullable<StatCardProps['color']>, string> = {
  amber: 'text-warning/80',
  blue: 'text-info/80',
  green: 'text-success/80',
  teal: 'text-success/80',
  orange: 'text-warning/80',
  red: 'text-destructive/80',
  gray: 'text-muted-foreground',
  cyan: 'text-info/80',
  sky: 'text-info/80',
  rose: 'text-destructive/80',
  indigo: 'text-primary/80',
}

export function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  unit,
  dot,
  dim,
  onClick,
  active = false,
  color = 'sky',
  className,
  dense = false,
  variant = 'default',
}: Readonly<StatCardProps & { variant?: 'default' | 'minimal' }>) {
  const isZeroValue = value === 0 || value === '0' || value === '0 Bytes' || value === '' || value == null
  const isDimmed = dim ?? isZeroValue

  if (variant === 'minimal') {
    const Wrapper = onClick ? 'button' : 'div'
    const statusColorStyle = isDimmed
      ? 'bg-muted/40 text-muted-foreground'
      : active
        ? 'border-primary bg-primary/10 text-primary'
        : 'bg-card text-foreground'

    return (
      <Wrapper
        onClick={onClick}
        type={onClick ? 'button' : undefined}
        className={cn(
          'group/stat inline-flex h-9 items-center gap-2.5 whitespace-nowrap rounded-md border border-border px-3 text-left transition-colors duration-150',
          onClick && 'cursor-pointer hover:bg-muted/60',
          statusColorStyle,
          className,
        )}
      >
        <div className={cn(
          'relative flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/60',
          isDimmed
            ? 'text-muted-foreground/70'
            : active
              ? 'text-primary'
              : iconTextStyles[color]
        )}>
          <Icon className="size-4" />
          {dot && !isDimmed && (
            <span className={cn("absolute -right-0.5 -top-0.5 inline-block size-2 rounded-full ring-2 ring-background shadow-sm", dotStyles[dot])} />
          )}
        </div>
        <div className="flex flex-col">
          <span className="mb-0.5 text-xs font-medium leading-none text-muted-foreground">
            {label}
          </span>
          <div className="flex items-baseline gap-1">
            <span className={cn(
              'text-sm font-semibold tabular-nums leading-none',
              isDimmed ? 'text-muted-foreground' : 'text-foreground'
            )}>
              {value}
            </span>
            {unit && (
              <span className={cn(
                'text-xs text-muted-foreground',
                isDimmed ? 'opacity-60' : 'opacity-100'
              )}>
                {unit}
              </span>
            )}
          </div>
        </div>
      </Wrapper>
    )
  }

  const silentColorStyle = 'bg-muted/40 text-muted-foreground'
  const silentIconStyle = 'text-muted-foreground/70'

  if (dense) {
    return (
      <div className={cn(
        'group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2',
        isDimmed && silentColorStyle,
        className
      )}>
        <div className={cn('flex size-8 items-center justify-center rounded-md bg-muted/60', isDimmed ? silentIconStyle : iconTextStyles[color])}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className={cn('truncate text-sm font-semibold tabular-nums', isDimmed ? 'text-muted-foreground' : valueColorStyles[color])}>{value}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(
      'group relative flex items-center gap-4 overflow-hidden rounded-lg border border-border bg-card px-4 py-3',
      isDimmed && silentColorStyle,
      className
    )}>
      <div className={cn('relative flex size-10 items-center justify-center rounded-md bg-muted/60', isDimmed ? silentIconStyle : iconTextStyles[color])}>
        <Icon className="size-5" />
      </div>
      <div className="relative min-w-0 flex-1">
        <p className="mb-1 truncate text-sm font-medium text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className={cn('truncate text-xl font-semibold leading-none tabular-nums', isDimmed ? 'text-muted-foreground' : valueColorStyles[color])}>{value}</p>
          {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
        </div>
      </div>
    </div>
  )
}

export function StatsGrid({ children, className, dense = false }: Readonly<{ children: React.ReactNode; className?: string; dense?: boolean }>) {
  return (
    <div className={cn(
      dense
        ? 'grid grid-cols-1 gap-2 md:gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
        : 'grid grid-cols-1 gap-3 md:gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
      className
    )}>
      {children}
    </div>
  )
}
