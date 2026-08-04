'use client'

import Link from 'next/link'
import {
  CalendarClock,
  Database,
  FileSearch,
  FolderTree,
  Layers,
  Route,
  type LucideIcon,
} from 'lucide-react'

import { getFileTypeMeta } from '@/components/knowledge/file-type'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { buildChunkPreviewDocumentHref } from '@/lib/chunk-preview-links'
import { getParserLabel } from '@/lib/parser-options'
import { toTrimmedPrimitiveString } from '@/lib/primitive-text'
import { cn, formatDate, formatFileSize } from '@/lib/utils'
import type { Document } from '@/types'

type KnowledgeInspectorProps = {
  selectedDocs: Document[]
  datasetLabelById?: Record<string, string>
  children?: React.ReactNode
  className?: string
  embedded?: boolean
}

function getStatusLabel(status: unknown) {
  const value = String(status || '').toLowerCase()
  if (value === 'completed' || value === 'ready') return '已就绪'
  if (value === 'processing' || value === 'pending') return '处理中'
  if (value === 'failed') return '失败'
  if (value === 'quarantined') return '隔离'
  if (value === 'disabled') return '已停用'
  if (value === 'archived') return '已归档'
  return '未知'
}

export function KnowledgeInspector({
  selectedDocs,
  datasetLabelById,
  children,
  className,
  embedded = false,
}: Readonly<KnowledgeInspectorProps>) {
  const selected = selectedDocs.length === 1 ? selectedDocs[0] : null
  const fileType = selected ? getFileTypeMeta(selected) : null
  const TypeIcon = fileType?.icon
  const metadata = selected?.metadata
  const sourcePath = selected
    ? toTrimmedPrimitiveString(metadata?.source_path)
    : ''
  const parserBackend = selected
    ? toTrimmedPrimitiveString(metadata?.parser_backend)
    : ''
  const parserLabel = parserBackend ? getParserLabel(parserBackend) : '自动选择'
  const datasetId = String(selected?.dataset_id || '')
  const datasetLabel = datasetId
    ? datasetLabelById?.[datasetId] || '已关联知识库'
    : '未关联知识库'

  const header = (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
      <h2 className="text-sm font-semibold text-foreground">文档详情</h2>
      {selectedDocs.length > 0 ? (
        <span className="text-xs tabular-nums text-muted-foreground">
          已选 {selectedDocs.length} 份
        </span>
      ) : null}
    </div>
  )

  const summary = (() => {
    if (selected) {
      return (
        <div className="space-y-4">
          <section className="flex min-w-0 items-start gap-3 border-b border-border pb-4">
            {fileType && TypeIcon ? (
              <div
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-md border',
                  fileType.bg,
                  fileType.border,
                  fileType.color
                )}
              >
                <TypeIcon className="size-4" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <h3
                className="break-words text-sm font-semibold leading-5 text-foreground"
                title={selected.filename}
              >
                {selected.filename}
              </h3>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{fileType?.label || '未知类型'}</span>
                <span>{getStatusLabel(selected.status)}</span>
                <span>{parserLabel}</span>
              </div>
            </div>
          </section>

          <section aria-labelledby="knowledge-document-facts-title">
            <h3
              id="knowledge-document-facts-title"
              className="mb-2 text-xs font-medium text-muted-foreground"
            >
              基础信息
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 border-y border-border">
              <InspectorFact
                icon={FileSearch}
                label="文件大小"
                value={formatFileSize(Number(selected.file_size || 0))}
              />
              <InspectorFact
                icon={Layers}
                label="切片数"
                value={String(selected.chunk_count ?? 0)}
              />
              <InspectorFact
                icon={CalendarClock}
                label="创建时间"
                value={formatDate(selected.created_at)}
              />
              <InspectorFact
                icon={CalendarClock}
                label="更新时间"
                value={formatDate(selected.updated_at || selected.created_at)}
              />
            </dl>
          </section>

          <section className="space-y-3" aria-labelledby="knowledge-document-source-title">
            <h3
              id="knowledge-document-source-title"
              className="text-xs font-medium text-muted-foreground"
            >
              文档来源
            </h3>
            <div className="flex min-w-0 items-start gap-2 text-xs">
              <Database className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-muted-foreground">所属知识库</div>
                <div className="mt-0.5 break-words font-medium text-foreground">
                  {datasetLabel}
                </div>
              </div>
            </div>
            {sourcePath ? (
              <div className="flex min-w-0 items-start gap-2 text-xs">
                <FolderTree className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-muted-foreground">来源路径</div>
                  <div
                    className="mt-0.5 break-all font-medium leading-5 text-foreground"
                    title={sourcePath}
                  >
                    {sourcePath}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 rounded-md"
            >
              <Link
                href={buildChunkPreviewDocumentHref(selected.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Layers className="mr-2 size-4" />
                切片管理
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 rounded-md"
            >
              <Link href={`/knowledge/${selected.id}/health`}>
                <Route className="mr-2 size-4" />
                健康审计
              </Link>
            </Button>
          </div>
        </div>
      )
    }

    if (selectedDocs.length > 1) {
      return (
        <div className="rounded-md border border-dashed border-border p-4 text-xs leading-5 text-muted-foreground">
          已选择 {selectedDocs.length} 份文档。请选择一份文档查看详情。
        </div>
      )
    }

    return (
      <div className="rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
        选择一份文档查看详情。
      </div>
    )
  })()

  if (embedded) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col bg-background', className)}>
        {header}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {summary}
          {children ? <div className="border-t border-border pt-4">{children}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <Panel
      padding="none"
      className={cn(
        'flex min-h-0 flex-col overflow-hidden border-border bg-background',
        className
      )}
    >
      {header}
      <div
        data-page-scroll-container="true"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
      >
        {summary}
        {children ? <div className="border-t border-border pt-4">{children}</div> : null}
      </div>
    </Panel>
  )
}

function InspectorFact({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: LucideIcon
  label: string
  value: string
}>) {
  return (
    <div className="min-w-0 border-b border-border py-2.5 last:border-b-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </dt>
      <dd
        className="mt-1 break-words text-xs font-medium tabular-nums text-foreground"
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}
