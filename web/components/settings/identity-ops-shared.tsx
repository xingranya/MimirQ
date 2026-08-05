import type { ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/panel'
import { cn, detachPromise } from '@/lib/utils'

type IdentityStatusTone = 'neutral' | 'success' | 'warning' | 'error' | 'progress'

const STATUS_TONE_CLASS: Record<IdentityStatusTone, string> = {
  neutral: 'bg-muted-foreground/45',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  progress: 'bg-primary',
}

export const IDENTITY_INPUT_CLASS =
  'h-9 rounded-md border-border bg-background text-sm'

export function IdentityPanel({
  icon: Icon,
  title,
  description,
  status,
  statusTone = 'neutral',
  children,
}: Readonly<{
  icon: LucideIcon
  title: string
  description: string
  status: string
  statusTone?: IdentityStatusTone
  children: ReactNode
}>) {
  const isProgress = statusTone === 'progress'

  return (
    <Panel
      padding="sm"
      className="overflow-hidden rounded-md border border-border bg-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div
          aria-live="polite"
          className="flex min-h-8 w-fit shrink-0 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground"
        >
          {isProgress ? (
            <Loader2
              className="size-3.5 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <span
              className={cn('size-1.5 rounded-sm', STATUS_TONE_CLASS[statusTone])}
              aria-hidden="true"
            />
          )}
          <span>{status}</span>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">{children}</div>
    </Panel>
  )
}

export function IdentityField({
  id,
  label,
  helper,
  children,
}: Readonly<{
  id: string
  label: string
  helper?: string
  children: ReactNode
}>) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
      {helper ? (
        <p className="text-xs leading-5 text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  )
}

export function IdentityActionButton({
  busy,
  disabled,
  icon: Icon,
  label,
  onClick,
}: Readonly<{
  busy: boolean
  disabled: boolean
  icon?: LucideIcon
  label: string
  onClick: () => Promise<void>
}>) {
  return (
    <Button
      variant="outline"
      className="h-9 gap-1.5 rounded-md border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted disabled:bg-muted/50 disabled:text-muted-foreground"
      disabled={disabled}
      onClick={() => detachPromise(onClick())}
    >
      {busy ? (
        <Loader2
          className="size-3.5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : Icon ? (
        <Icon className="size-3.5" aria-hidden="true" />
      ) : null}
      {label}
    </Button>
  )
}

export function IdentityNotice({
  tone,
  children,
}: Readonly<{
  tone: 'success' | 'warning' | 'error'
  children: ReactNode
}>) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'mt-3 rounded-md border px-3 py-2 text-sm font-medium leading-5',
        tone === 'success' && 'border-success/20 bg-success/10 text-success',
        tone === 'warning' && 'border-warning/20 bg-warning/10 text-warning',
        tone === 'error' && 'border-destructive/20 bg-destructive/10 text-destructive'
      )}
    >
      {children}
    </div>
  )
}
