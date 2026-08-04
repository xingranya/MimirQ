'use client'

import { Copy, Download, FileJson } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  cellSurfaceClass,
  jsonLineSurfaceClass,
  lineNumberClassForStatus,
  splitCodeLines,
  tokenClassName,
  tokenizeJsonLine,
} from '../json-diff'
import type { DiffCell, DiffCellStatus } from '../types'

export function JsonLine({
  lineNumber,
  text,
  status,
  side = 'single',
}: Readonly<{
  lineNumber: number | null
  text: string
  status: DiffCellStatus | 'single'
  side?: 'left' | 'right' | 'single'
}>) {
  const tokens = useMemo(() => tokenizeJsonLine(text), [text])
  const lineNumberClass = lineNumberClassForStatus(status)

  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[52px_minmax(0,1fr)] border-b border-border/60 text-xs leading-6',
        jsonLineSurfaceClass(status, side)
      )}
    >
      <div
        className={cn(
          'select-none border-r border-border/70 px-3 text-right font-mono tabular-nums',
          lineNumberClass
        )}
      >
        {lineNumber ?? ''}
      </div>
      <div className="px-3 font-mono">
        <span className="inline-block min-w-full whitespace-pre">
          {tokens.map((token, index) => (
            <span
              key={`${lineNumber ?? 'x'}:${index}:${token.kind}`}
              className={tokenClassName(token.kind)}
            >
              {token.text}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

export function JsonDiffCell({
  cell,
  side,
}: Readonly<{
  cell: DiffCell
  side: 'left' | 'right'
}>) {
  const tokens = useMemo(() => tokenizeJsonLine(cell.text), [cell.text])
  const lineNumberClass = lineNumberClassForStatus(cell.status)

  return (
    <>
      <div
        className={cn(
          'select-none border-r border-border/70 px-3 py-0.5 text-right font-mono text-xs leading-6 tabular-nums',
          cellSurfaceClass(cell.status, side),
          lineNumberClass
        )}
      >
        {cell.lineNumber ?? ''}
      </div>
      <div
        className={cn(
          'px-3 py-0.5 font-mono text-xs leading-6',
          cellSurfaceClass(cell.status, side)
        )}
      >
        <span className="inline-block min-w-full whitespace-pre">
          {tokens.map((token, index) => (
            <span
              key={`${cell.lineNumber ?? side}:${index}:${token.kind}`}
              className={tokenClassName(token.kind)}
            >
              {token.text}
            </span>
          ))}
        </span>
      </div>
    </>
  )
}

export function JsonCodePane({
  label,
  title,
  subtitle,
  code,
  isEmpty,
  emptyState,
  onCopy,
  onDownload,
}: Readonly<{
  label: string
  title: string
  subtitle?: string
  code: string
  isEmpty?: boolean
  emptyState?: ReactNode
  onCopy: () => void
  onDownload: () => void
}>) {
  const lines = useMemo(() => splitCodeLines(code), [code])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4 py-2.5">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <FileJson className="h-3 w-3 text-primary/70" aria-hidden="true" />
            {label}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            title="复制 JSON"
            onClick={onCopy}
            disabled={isEmpty}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            title="导出 JSON"
            onClick={onDownload}
            disabled={isEmpty}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-background">
        {isEmpty && emptyState ? (
          emptyState
        ) : (
          <div className="min-w-max">
            {lines.map((line, index) => (
              <JsonLine
                key={`${title}:${index + 1}`}
                lineNumber={index + 1}
                text={line}
                status="single"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
