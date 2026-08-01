'use client'

import type { LucideIcon } from 'lucide-react'
import { ShieldCheck, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import { PageTitleIcon, type PageTitleIconName } from '@/components/ui/page-title-icon'
import { cn } from '@/lib/utils'

export const KNOWLEDGE_OPS_BACKGROUND_CLASS =
  'flex min-h-0 flex-1 flex-col overflow-hidden bg-background'

export const MANAGEMENT_HERO_PANEL_CLASS =
  'relative overflow-hidden border-b border-border bg-background px-4 py-3'

export const KNOWLEDGE_OPS_HERO_PANEL_CLASS = MANAGEMENT_HERO_PANEL_CLASS

export const KNOWLEDGE_OPS_SUMMARY_PANEL_CLASS =
  'flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground'

type KnowledgeOpsHeroProps = {
  iconImage: PageTitleIconName
  title: ReactNode
  description: ReactNode
  eyebrow?: ReactNode
  badge?: ReactNode
  summary?: ReactNode
  actions?: ReactNode
  className?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function KnowledgeOpsHero({
  iconImage,
  title,
  description,
  eyebrow = 'Knowledge Ops',
  badge = '文档资产治理中枢',
  summary,
  actions,
  className,
  titleClassName,
  descriptionClassName,
}: Readonly<KnowledgeOpsHeroProps>) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between',
        KNOWLEDGE_OPS_HERO_PANEL_CLASS,
        className
      )}
    >
      <div className="relative flex min-w-0 items-center gap-3">
        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-primary">
          <PageTitleIcon name={iconImage} className="size-9" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3" />
              {eyebrow}
            </span>
            <span className="inline-flex items-center rounded-md border border-success/30 bg-success/10 px-2 py-1 text-xs font-medium text-success">
              <ShieldCheck className="mr-1.5 size-3" />
              {badge}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1
              className={cn(
                'text-xl font-semibold text-foreground',
                titleClassName
              )}
            >
              <span>{title}</span>
            </h1>
            <p
              className={cn(
                'text-[13px] leading-5 text-muted-foreground/85',
                descriptionClassName
              )}
            >
              {description}
            </p>
          </div>
        </div>
      </div>
      {summary || actions ? (
        <div className="relative flex min-w-0 flex-col gap-2 lg:min-w-[470px]">
          {summary}
          {actions ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type KnowledgeOpsFlowCardProps = {
  steps: Array<{ icon: LucideIcon; label: ReactNode }>
  className?: string
}

export function KnowledgeOpsFlowCard({
  steps,
  className,
}: Readonly<KnowledgeOpsFlowCardProps>) {
  return (
    <div
      className={cn(
        KNOWLEDGE_OPS_SUMMARY_PANEL_CLASS,
        className
      )}
    >
      {steps.map((step, index) => {
        const Icon = step.icon
        return (
          <div
            key={`${String(step.label)}-${index}`}
            className="contents"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon className="size-3 text-info" />
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span
                className="size-3 shrink-0 text-muted-foreground/45"
                aria-hidden="true"
              >
                →
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
