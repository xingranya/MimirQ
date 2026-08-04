'use client'

import { Switch, type SwitchProps } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type SettingsSwitchIndicatorProps = {
  readonly checked: boolean
  readonly className?: string
}

const SETTINGS_SWITCH_TRACK =
  'relative inline-flex h-6 w-11 shrink-0 items-center overflow-hidden rounded-full border p-0 shadow-none transition-colors duration-150'

const SETTINGS_SWITCH_STATE =
  '[--switch-translate-checked:1.25rem] [--switch-translate-unchecked:0rem]'

const SETTINGS_SWITCH_TONE =
  'border-border bg-muted data-[switch-state=checked]:border-primary data-[switch-state=checked]:bg-primary hover:data-[switch-state=unchecked]:border-muted-foreground/50'

const SETTINGS_SWITCH_THUMB =
  '[&>span]:size-5 [&>span]:rounded-full [&>span]:border [&>span]:border-border [&>span]:bg-background [&>span]:shadow-none [&>span]:transition-transform'

export function SettingsSwitchIndicator({
  checked,
  className,
}: Readonly<SettingsSwitchIndicatorProps>) {
  return (
    <span
      aria-hidden="true"
      data-state={checked ? 'checked' : 'unchecked'}
      data-switch-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        SETTINGS_SWITCH_TRACK,
        SETTINGS_SWITCH_STATE,
        SETTINGS_SWITCH_TONE,
        SETTINGS_SWITCH_THUMB,
        'pointer-events-none',
        className
      )}
    >
      <span
        data-state={checked ? 'checked' : 'unchecked'}
        data-switch-state={checked ? 'checked' : 'unchecked'}
        className={cn(
          'pointer-events-none block size-5 rounded-full border border-border bg-background shadow-none ring-0 transition-transform duration-150',
          checked
            ? 'translate-x-[var(--switch-translate-checked,1.25rem)]'
            : 'translate-x-[var(--switch-translate-unchecked,0rem)]'
        )}
      />
    </span>
  )
}

export function SettingsSwitch({ className, ...props }: Readonly<SwitchProps>) {
  return (
    <Switch
      className={cn(
        SETTINGS_SWITCH_TRACK,
        SETTINGS_SWITCH_STATE,
        SETTINGS_SWITCH_TONE,
        SETTINGS_SWITCH_THUMB,
        className
      )}
      {...props}
    />
  )
}
