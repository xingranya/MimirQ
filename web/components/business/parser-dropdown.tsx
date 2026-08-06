'use client'

/**
 * Integrated pipeline 风格的解析器下拉选择组件
 * 带图标、描述和徽章的下拉菜单
 */
import { createPortal } from 'react-dom'
import { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles,
  FileText,
  Cpu,
  LayoutGrid,
  Cloud,
  ScanLine,
  ScanText,
  FileCode,
  Wand2,
  ChevronDown,
  Check,
} from 'lucide-react'
import { cn, detachPromise } from '@/lib/utils'
import { PARSER_BACKEND_OPTIONS, getParserOption } from '@/lib/parser-options'
import { usePipelineCapabilities } from '@/contexts/pipeline-capabilities-context'
import { normalizeParserBackendName, resolveParserBackendForFilename } from '@/lib/parser-compat'
import { settingsApi } from '@/lib/api/settings'
import { queryKeys } from '@/lib/query-keys'
import { UI_LAYER_CLASS } from '@/lib/ui-layers'

// 图标映射
const ICON_MAP = {
  auto: Sparkles,
  basic: FileText,
  docling: Cpu,
  layout: LayoutGrid,
  mineru: Cloud,
  deepdoc: ScanLine,
  deepseekocr: ScanText,
  markitdown: FileCode,
  magicpdf: Wand2,
}

// 颜色映射
const COLOR_MAP = {
  auto: { bg: 'bg-primary/10', text: 'text-primary' },
  basic: { bg: 'bg-muted', text: 'text-muted-foreground' },
  docling: { bg: 'bg-info/10', text: 'text-info' },
  layout: { bg: 'bg-success/10', text: 'text-success' },
  mineru: { bg: 'bg-primary/10', text: 'text-primary' },
  deepdoc: { bg: 'bg-warning/10', text: 'text-warning' },
  deepseekocr: { bg: 'bg-destructive/10', text: 'text-destructive' },
  markitdown: { bg: 'bg-accent/10', text: 'text-accent' },
  magicpdf: { bg: 'bg-accent/10', text: 'text-accent' },
}

interface ParserDropdownProps {
  value: string
  onChange: (value: string) => void
  className?: string
  filename?: string
  compact?: boolean
}

type ParserStatusWithHealth = {
  health?: {
    pipeline_version?: unknown
    version?: unknown
  }
}

export function ParserDropdown({ value, onChange, className, filename, compact = false }: Readonly<ParserDropdownProps>) {
  const [isOpen, setIsOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [menuMaxHeight, setMenuMaxHeight] = useState(420)
  const [menuRect, setMenuRect] = useState<{
    left: number
    width: number
    top?: number
    bottom?: number
  } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { capabilities, loading, error, refresh, parserBackendAvailable } = usePipelineCapabilities()
  const isPaddleVlAvailable = parserBackendAvailable('paddle_vl') === true

  const paddleVlStatusQuery = useQuery({
    queryKey: queryKeys.settings.status,
    queryFn: settingsApi.getStatus,
    enabled: isPaddleVlAvailable,
    staleTime: 60_000,
    retry: 1,
  })

  const parserNotesByName = new Map<string, string>()
  for (const info of capabilities?.pdf_backends || []) {
    const key = normalizeParserBackendName(info.name)
    const notes = (info.notes || '').trim()
    if (key && notes) parserNotesByName.set(key, notes)
  }

  const selectedOption = getParserOption(value)
  const SelectedIcon = ICON_MAP[selectedOption.icon]
  const selectedColor = COLOR_MAP[selectedOption.icon]

  const paddleVlVersionBadge = useMemo(() => {
    if (!isPaddleVlAvailable) return null
    const parserStatus = paddleVlStatusQuery.data?.parsers?.paddle_vl as ParserStatusWithHealth | undefined
    const health = parserStatus?.health
    const version =
      typeof health?.pipeline_version === 'string'
        ? health.pipeline_version
        : typeof health?.version === 'string'
          ? health.version
          : ''
    return version ? `PaddleOCR-VL ${version}` : null
  }, [isPaddleVlAvailable, paddleVlStatusQuery.data])

  const updateMenuPlacement = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect()
    if (!triggerRect) return

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const spaceBelow = viewportHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top
    const shouldOpenUpward = spaceBelow < 440 && spaceAbove > spaceBelow
    const availableSpace = shouldOpenUpward ? spaceAbove - 16 : spaceBelow - 16
    const preferredWidth = compact ? 420 : Math.max(triggerRect.width, 320)
    const menuWidth = Math.min(preferredWidth, Math.max(240, viewportWidth - 24))
    const menuLeft = Math.min(
      Math.max(12, triggerRect.left),
      Math.max(12, viewportWidth - menuWidth - 12)
    )

    setOpenUpward(shouldOpenUpward)
    setMenuMaxHeight(Math.max(180, Math.min(440, Math.floor(availableSpace))))
    setMenuRect({
      left: menuLeft,
      width: menuWidth,
      ...(shouldOpenUpward
        ? { bottom: viewportHeight - triggerRect.top + 8 }
        : { top: triggerRect.bottom + 8 }),
    })
  }, [compact])

  useEffect(() => {
    if (!isOpen) return

    updateMenuPlacement()
    window.addEventListener('resize', updateMenuPlacement)
    window.addEventListener('scroll', updateMenuPlacement, true)

    return () => {
      window.removeEventListener('resize', updateMenuPlacement)
      window.removeEventListener('scroll', updateMenuPlacement, true)
    }
  }, [isOpen, updateMenuPlacement])

  // 点击外部关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !dropdownRef.current?.contains(event.target) &&
        !menuRef.current?.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      {/* 触发按钮 */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) updateMenuPlacement()
          setIsOpen((open) => !open)
        }}
        className={cn(
          'flex w-full items-center border transition-colors duration-150 motion-reduce:transition-none',
          compact
            ? 'h-9 gap-2 rounded-md px-2.5'
            : 'min-h-16 gap-2.5 rounded-md px-2.5 py-2',
          'bg-card hover:bg-muted',
          isOpen
            ? 'border-primary/30 ring-2 ring-primary/10'
            : 'border-border hover:border-border'
        )}
      >
        <div className={cn(compact ? 'rounded-md p-1' : 'rounded-md p-1.5', selectedColor.bg)}>
          <SelectedIcon className={cn('size-3.5', selectedColor.text)} />
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('truncate font-medium text-foreground', compact ? 'text-sm' : 'text-sm')}>
              {selectedOption.label}
            </span>
            {selectedOption.badge && (
              <span className="rounded bg-primary/10 px-1.5 py-px text-xs font-medium leading-4 text-primary">
                {selectedOption.badge}
              </span>
            )}
            {selectedOption.value === 'paddle_vl' && paddleVlVersionBadge ? (
                <span className="rounded bg-success/10 px-1.5 py-px text-xs font-medium leading-4 text-success">
                {paddleVlVersionBadge}
              </span>
            ) : null}
          </div>
          {!compact && (
            <p className="mt-0.5 truncate text-sm leading-5 text-muted-foreground">{selectedOption.description}</p>
          )}
        </div>
        <ChevronDown
          className={cn(
            'size-3.5 text-muted-foreground transition-transform flex-shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && menuRect && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-label="解析方式选项"
              className={cn(
                'fixed overflow-hidden rounded-md border border-border bg-card',
                UI_LAYER_CLASS.contextual
              )}
              style={{
                left: menuRect.left,
                width: menuRect.width,
                ...(openUpward ? { bottom: menuRect.bottom } : { top: menuRect.top }),
              }}
            >
              <div
                className="max-h-[min(440px,70vh)] overflow-y-auto overscroll-contain py-1 no-scrollbar"
                style={{ maxHeight: menuMaxHeight }}
              >
          {(loading || error) && (
            <div
              className={cn(
                'px-3 py-2 text-xs border-b',
                error
                  ? 'bg-destructive/10 text-destructive border-destructive/25'
                  : 'bg-muted text-muted-foreground border-border'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {loading ? '正在加载后端解析器能力…' : '无法获取后端解析器能力，部分选项可能不可用'}
                </div>
                {error ? (
                  <button
                    type="button"
                    className="flex-shrink-0 text-xs text-destructive hover:text-destructive/80 underline underline-offset-2"
                    onClick={() => {
                      detachPromise(refresh())
                    }}
                  >
                    重试
                  </button>
                ) : null}
              </div>
              {error ? (
                <div className="mt-1 truncate text-sm text-destructive/80" title={error}>
                  {error}
                </div>
              ) : null}
            </div>
          )}
            {PARSER_BACKEND_OPTIONS.map((option) => {
              const Icon = ICON_MAP[option.icon]
              const color = COLOR_MAP[option.icon]
              const isSelected = option.value === selectedOption.value
              const availability = parserBackendAvailable(option.value)
              const isDisabledByFile =
                Boolean(filename) &&
                option.value !== 'auto' &&
                resolveParserBackendForFilename(filename || '', option.value).backend !== option.value
              const isDisabledByCapabilities = option.value !== 'auto' && option.value !== 'basic' && availability !== true
              const isDisabled = isDisabledByFile || isDisabledByCapabilities
              const notes = parserNotesByName.get(normalizeParserBackendName(option.value))
              const disabledTitle = isDisabledByFile
                ? '该文件类型不支持此解析器'
                : (notes || '后端未启用该解析器（可到“设置”开启/配置）')
              const disabledLabel = isDisabledByFile ? '不适用' : '未启用'

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={isDisabled}
                  title={isDisabled ? disabledTitle : undefined}
                  onClick={() => {
                    if (isDisabled) return
                    onChange(option.value)
                    setIsOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 transition-colors',
                    isSelected ? 'bg-primary/10' : 'hover:bg-muted',
                    isDisabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
                  )}
                >
                  <div className={cn('rounded-md p-1.5', color.bg)}>
                    <Icon className={cn('size-4', color.text)} />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-medium truncate',
                          isSelected ? 'text-primary' : 'text-foreground'
                        )}
                      >
                        {option.label}
                      </span>
                      {option.badge && (
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs font-medium',
                            isSelected
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {option.badge}
                        </span>
                      )}
                      {option.value === 'paddle_vl' && availability === true && paddleVlVersionBadge ? (
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs font-medium',
                            isSelected
                              ? 'bg-success/10 text-success'
                              : 'bg-success/8 text-success'
                          )}
                        >
                          {paddleVlVersionBadge}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">{option.description}</p>
                  </div>
                  {isDisabled && (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                      {disabledLabel}
                    </span>
                  )}
                  {isSelected && (
                    <Check className="size-4 flex-shrink-0 text-primary" />
                  )}
                </button>
              )
            })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
