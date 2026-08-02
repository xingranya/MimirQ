'use client'

import { FileText, MessageSquare, Scissors, ShieldCheck } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import type { ComponentType } from 'react'

type Step = {
  key: 'parsing' | 'governance' | 'chunk' | 'chat'
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  match: (pathname: string) => boolean
}

function getSteps(t: ReturnType<typeof useTranslations<'CommonUi'>>): Step[] {
  return [
    {
      key: 'parsing',
      label: t("ingestionWorkflow.parsing"),
      href: '/parsing',
      icon: FileText,
      match: (p) => p === '/parsing' || p.startsWith('/parsing/'),
    },
    {
      key: 'governance',
      label: t("ingestionWorkflow.governance"),
      href: '/data-governance',
      icon: ShieldCheck,
      match: (p) => p === '/data-governance' || p.startsWith('/data-governance/'),
    },
    {
      key: 'chunk',
      label: t("ingestionWorkflow.chunk"),
      href: '/chunk-preview',
      icon: Scissors,
      match: (p) => p === '/chunk-preview' || p.startsWith('/chunk-preview/'),
    },
    {
      key: 'chat',
      label: t("ingestionWorkflow.chat"),
      href: '/',
      icon: MessageSquare,
      match: (p) => p === '/' || p.startsWith('/history'),
    },
  ]
}

function getCurrentStepIndex(pathname: string, steps: Step[]) {
  const p = pathname || '/'
  const idx = steps.findIndex((s) => s.match(p))
  return Math.max(idx, 0)
}

export function IngestionWorkflowStepper({
  className,
  compact = true,
}: Readonly<{
  className?: string
  compact?: boolean
}>) {
  const t = useTranslations('CommonUi')
  const pathname = usePathname() || '/'
  const steps = getSteps(t)
  const currentIndex = getCurrentStepIndex(pathname, steps)

  return (
    <nav
      aria-label={t("ingestionWorkflow.navLabel")}
      className={cn(
        'flex items-center',
        compact ? 'gap-2' : 'w-full min-w-0 gap-1',
        className
      )}
    >
      {steps.map((step, index) => {
        const Icon = step.icon
        const isActive = index === currentIndex
        const isDone = index < currentIndex

        return (
          <div
            key={step.key}
            className={cn(
              'flex items-center',
              compact
                ? 'gap-2'
                : 'min-w-0 flex-1'
            )}
          >
            <Link
              href={step.href}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'inline-flex items-center rounded-md border font-medium transition-colors focus-ring',
                compact
                  ? 'h-7 gap-1.5 px-3 py-1.5 text-[11px]'
                  : 'h-9 w-full min-w-0 justify-center gap-1.5 px-1 text-xs sm:px-2',
                isActive &&
                  (compact
                    ? 'border-primary/25 bg-primary/10 text-primary'
                    : 'border-primary/30 bg-primary/10 text-primary'),
                isDone &&
                  !isActive &&
                  (compact
                    ? 'border-border/60 bg-card/70 text-foreground hover:border-primary/20 hover:bg-primary/5'
                    : 'border-transparent bg-transparent text-foreground/82 hover:bg-info/[0.045] hover:text-info'),
                !isDone &&
                  !isActive &&
                  (compact
                    ? 'border-border/60 bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                    : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground')
              )}
              title={step.label}
            >
              {compact ? (
                <Icon
                  className={cn(
                    'h-3.5 w-3.5',
                    isActive && 'text-primary',
                    isDone && !isActive && 'text-foreground/80',
                    !isDone && !isActive && 'text-muted-foreground'
                  )}
                />
              ) : (
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums',
                    isActive &&
                      'border-primary bg-primary text-primary-foreground',
                    isDone &&
                      !isActive &&
                      'border-primary/20 bg-primary/[0.08] text-primary',
                    !isDone &&
                      !isActive &&
                      'border-border bg-background text-muted-foreground'
                  )}
                >
                  {index + 1}
                </span>
              )}
              <span className="whitespace-nowrap">{step.label}</span>
            </Link>
            {index < steps.length - 1 && compact ? (
              <span
                className={cn(
                  'select-none text-muted-foreground/40',
                  compact ? 'text-xs' : 'sr-only'
                )}
              >
                →
              </span>
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}
