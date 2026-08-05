'use client'

import { useCallback, useState, type ReactNode, type SyntheticEvent } from 'react'
import { ChevronDown } from 'lucide-react'

type SettingsSubsectionProps = {
  id: string
  title: string
  children: ReactNode
  advanced?: boolean
  forceOpen?: boolean
}

/** 渲染设置页二级区块，并保留用户手动展开状态。 */
export function SettingsSubsection({
  id,
  title,
  children,
  advanced = false,
  forceOpen = false,
}: Readonly<SettingsSubsectionProps>) {
  const [manualOpen, setManualOpen] = useState(false)
  const handleToggle = useCallback(
    (event: SyntheticEvent<HTMLDetailsElement>) => {
      if (forceOpen) {
        if (!event.currentTarget.open) event.currentTarget.open = true
        return
      }
      setManualOpen(event.currentTarget.open)
    },
    [forceOpen]
  )

  if (advanced) {
    return (
      <details
        data-testid="settings-advanced-section"
        data-settings-subsection-id={id}
        open={forceOpen || manualOpen}
        onToggle={handleToggle}
        className="group scroll-mt-24 border-t border-border pt-3"
      >
        <summary className="flex cursor-pointer list-none select-none items-center justify-between gap-3 py-1 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>{title}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground">
            高级配置
            <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <div className="pt-4">{children}</div>
      </details>
    )
  }

  return (
    <section data-settings-subsection-id={id} className="scroll-mt-24 space-y-3">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </section>
  )
}
