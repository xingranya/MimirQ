'use client'

import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import {
  INLINE_STAT_TONE_CLASSES,
  INLINE_STAT_VALUE_TONE_CLASSES,
} from '../constants'

export function getHashPairIcon(hasA: boolean, hasB: boolean): ReactNode {
  if (hasA && hasB) return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
  if (hasA || hasB) return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
  return <CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />
}

export function SnapshotInlineStat({
  icon,
  label,
  value,
  tone = 'muted',
  valueTitle,
  valueClassName,
}: Readonly<{
  icon?: ReactNode
  label: string
  value: ReactNode
  tone?: 'muted' | 'neutral' | 'positive' | 'negative' | 'warning'
  valueTitle?: string
  valueClassName?: string
}>) {
  const toneClasses = INLINE_STAT_TONE_CLASSES[tone]
  const valueTone = INLINE_STAT_VALUE_TONE_CLASSES[tone]

  return (
    <div
      className={cn(
        'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1',
        toneClasses
      )}
    >
      {icon ? (
        <span className="flex h-3.5 w-3.5 items-center justify-center opacity-80">
          {icon}
        </span>
      ) : null}
      <span className="text-xs font-medium opacity-80">
        {label}
      </span>
      <span
        title={valueTitle}
        className={cn(
          'text-xs font-semibold tabular-nums',
          valueTone,
          valueClassName
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function WorkspaceSection({
  icon,
  label,
  hint,
  children,
}: Readonly<{
  icon?: ReactNode
  label: string
  hint?: string
  children: ReactNode
}>) {
  return (
    <section className="space-y-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {icon ? (
            <span className="flex h-3.5 w-3.5 items-center justify-center text-primary/70">
              {icon}
            </span>
          ) : null}
          {label}
        </div>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  icon,
  extra,
}: Readonly<{
  eyebrow: string
  title: string
  description?: string
  icon?: ReactNode
  extra?: ReactNode
}>) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-primary">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">
            {eyebrow}
          </div>
          <div className="mt-0.5 text-base font-semibold text-foreground">
            {title}
          </div>
          {description ? (
            <div className="mt-1 max-w-[640px] text-sm leading-5 text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
      </div>
      {extra ? <div className="shrink-0">{extra}</div> : null}
    </div>
  )
}

export function DiffEmptyState({
  title,
  description,
  hint,
}: Readonly<{
  title: string
  description: string
  hint?: string
}>) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center px-6 py-10">
      <div className="flex max-w-[440px] flex-col items-center text-center">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-border bg-muted/40 text-primary">
            <ArrowRightLeft
              className="h-6 w-6"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">
          {title}
        </h3>
        <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
        {hint ? (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
            <CircleDashed
              className="h-3.5 w-3.5 text-primary/60"
              aria-hidden="true"
            />
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  )
}
