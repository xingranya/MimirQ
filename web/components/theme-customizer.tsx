"use client"

import * as React from "react"
import { Check, Monitor, Moon, Palette, RefreshCw, Settings2, Sun } from "lucide-react"
import { useTranslations } from 'next-intl'
import { useTheme } from "next-themes"

import { getClientStorage } from "@/lib/client-storage"
import { cn } from "@/lib/utils"
import {
  applySurfaceTheme,
  applyThemeColor,
  clearThemeColor,
  notifyThemeAppearanceChanged,
  persistThemeAppearance,
  readSurfaceTheme,
  readThemeColorOverride,
  SURFACE_THEMES,
  type SurfaceThemeKey,
} from "@/lib/theme-surface"
import { IconButton } from "@/components/ui/icon-button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Label } from "@/components/ui/label"

const PRESET_COLORS = [
  { name: "天空蓝", value: "#0ea5e9" },
  { name: "石墨黑", value: "#18181b" },
  { name: "玫红", value: "#e11d48" },
  { name: "橙色", value: "#ea580c" },
  { name: "绿色", value: "#16a34a" },
  { name: "紫色", value: "#7c3aed" },
  { name: "黄色", value: "#ca8a04" },
]

type ThemeCustomizerProps = {
  trigger?: React.ReactNode
}

export function ThemeCustomizer({ trigger }: Readonly<ThemeCustomizerProps> = {}) {
  const [mounted, setMounted] = React.useState(false)
  const t = useTranslations('CommonUi')
  const { theme, setTheme } = useTheme()
  const [colorOverride, setColorOverride] = React.useState<string | null>(null)
  const [surfaceTheme, setSurfaceTheme] = React.useState<SurfaceThemeKey>('ocean')
  const triggerNode = trigger ?? (
    <IconButton
      label={t('themeCustomizer.openLabel')}
      variant="outline"
      className="fixed bottom-4 right-4 z-50 size-10 rounded-md border-border bg-background shadow-none transition-colors duration-200 hover:border-primary motion-reduce:transition-none supports-[padding:env(safe-area-inset-bottom)]:bottom-[calc(env(safe-area-inset-bottom)+1rem)] supports-[padding:env(safe-area-inset-right)]:right-[calc(env(safe-area-inset-right)+1rem)]"
    >
      <Settings2 className="size-6 text-primary" />
    </IconButton>
  )

  React.useEffect(() => {
    const storage = getClientStorage()
    if (storage) {
      const nextSurfaceTheme = readSurfaceTheme(storage)
      setSurfaceTheme(nextSurfaceTheme)
      setColorOverride(readThemeColorOverride(storage))
    }
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!mounted) return

    applySurfaceTheme(surfaceTheme)
    if (colorOverride) applyThemeColor(colorOverride)
    else clearThemeColor()
    if (globalThis.window !== undefined) {
      persistThemeAppearance(surfaceTheme, colorOverride)
      notifyThemeAppearanceChanged()
    }
  }, [colorOverride, mounted, surfaceTheme])

  if (!mounted) {
    return null
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        {triggerNode}
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[calc(100dvh-2rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto p-4 shadow-none"
        align="end"
        sideOffset={10}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-medium leading-none">{t('themeCustomizer.title')}</h4>
              <p className="text-xs text-muted-foreground">
                {t('themeCustomizer.description')}
              </p>
            </div>
            <IconButton
              label={t('themeCustomizer.resetAppearance')}
              variant="ghost"
              className="rounded-md"
              onClick={() => {
                setSurfaceTheme('ocean')
                setColorOverride(null)
                setTheme('system')
              }}
            >
              <RefreshCw className="size-4" />
            </IconButton>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('themeCustomizer.surfaceLabel')}</Label>
            <div className="grid gap-2">
              {SURFACE_THEMES.map((preset) => {
                const presetTitle = t(`themeCustomizer.surfacePresets.${preset.key}.title`)
                const selected = surfaceTheme === preset.key

                return (
                  <button
                    key={preset.key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSurfaceTheme(preset.key)
                      setColorOverride(null)
                    }}
                    className={cn(
                      'rounded-md border px-3 py-3 text-left transition-colors duration-200 motion-reduce:transition-none',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:bg-muted/60'
                    )}
                    aria-label={t('themeCustomizer.surfacePresetLabel', {
                      name: presetTitle,
                    })}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {presetTitle}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-muted-foreground">
                          {t(`themeCustomizer.surfacePresets.${preset.key}.description`)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className="size-4 rounded-full border border-black/10"
                          style={{
                            backgroundColor:
                              preset.key === 'deepsea'
                                ? '#F7F9FF'
                                : preset.key === 'neutral'
                                  ? '#FFFFFF'
                                  : preset.key === 'classic'
                                    ? '#F8F9FA'
                                    : preset.key === 'earth'
                                      ? '#F5F0E8'
                                      : '#F7FBFC',
                          }}
                        />
                        <span
                          className="size-4 rounded-full border border-black/10"
                          style={{ backgroundColor: preset.defaultPrimary }}
                        />
                        {selected ? <Check className="size-4 text-primary" /> : null}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs">{t('themeCustomizer.colorLabel')}</Label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setColorOverride(null)}
                aria-pressed={colorOverride === null}
                aria-label={t('themeCustomizer.useSurfaceColor')}
                title={t('themeCustomizer.useSurfaceColor')}
                className={cn(
                  "relative flex h-9 w-full items-center justify-center rounded-md border border-border bg-background transition-colors duration-200 hover:border-primary/45 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
                  colorOverride === null && "border-primary bg-primary/5"
                )}
              >
                <Palette className="size-4 text-muted-foreground" aria-hidden="true" />
                {colorOverride === null && (
                  <span className="absolute right-1 top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" aria-hidden="true" />
                    <span className="sr-only">{t('themeCustomizer.selected')}</span>
                  </span>
                )}
              </button>
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setColorOverride(preset.value)}
                  aria-pressed={colorOverride === preset.value}
                  aria-label={t('themeCustomizer.presetLabel', { name: preset.name })}
                  title={preset.name}
                  className={cn(
                    "relative flex h-9 w-full items-center justify-center rounded-md border border-border bg-background transition-colors duration-200 hover:border-primary/45 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
                    colorOverride === preset.value && "border-primary bg-primary/5"
                  )}
                >
                  <span 
                    className="size-4 rounded-full border border-black/10"
                    style={{ backgroundColor: preset.value }}
                  />
                  {colorOverride === preset.value && (
                    <span className="absolute right-1 top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-2.5" aria-hidden="true" />
                      <span className="sr-only">{t('themeCustomizer.selected')}</span>
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {colorOverride
                ? t('themeCustomizer.customColorActive')
                : t('themeCustomizer.surfaceColorActive')}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">{t('themeCustomizer.modeLabel')}</Label>
            <div className="grid grid-cols-3 gap-1 rounded-md border border-border bg-muted/40 p-1">
              {[
                { value: 'light', icon: Sun, label: t('modeToggle.light') },
                { value: 'dark', icon: Moon, label: t('modeToggle.dark') },
                { value: 'system', icon: Monitor, label: t('modeToggle.system') },
              ].map((option) => {
                const Icon = option.icon
                const selected = theme === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "flex min-w-0 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors duration-200 motion-reduce:transition-none",
                      selected
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
