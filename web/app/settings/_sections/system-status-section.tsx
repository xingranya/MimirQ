'use client'

import type { BackendMetaDetails, SystemStatus } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CheckCircle2, ChevronDown, Server, XCircle } from 'lucide-react'

type SystemStatusSectionProps = {
  status: SystemStatus | null
  backendMeta: BackendMetaDetails | null
}

function StatusItem({
  label,
  systemName,
  positive,
  positiveLabel,
  negativeLabel,
  detail,
}: Readonly<{
  label: string
  systemName?: string
  positive: boolean
  positiveLabel: string
  negativeLabel: string
  detail?: string
}>) {
  const stateLabel = positive ? positiveLabel : negativeLabel

  return (
    <div
      className={cn(
        'min-w-0 rounded-md border bg-card px-3 py-3',
        positive ? 'border-success/20' : 'border-destructive/20'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {systemName ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{systemName}</p>
          ) : null}
        </div>
        <div
          className={cn(
            'flex shrink-0 items-center gap-1.5 text-xs font-medium',
            positive ? 'text-success' : 'text-destructive'
          )}
        >
          {positive ? (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          ) : (
            <XCircle className="size-4" aria-hidden="true" />
          )}
          <span>{stateLabel}</span>
        </div>
      </div>
      {detail ? (
        <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

function formatParserName(key: string): string {
  const labels: Record<string, string> = {
    basic: '基础解析',
    markitdown: 'MarkItDown',
    pandoc: 'Pandoc',
    libreoffice: 'LibreOffice',
    deepdoc: 'DeepDoc',
    deepseek_ocr: 'DeepSeek OCR',
    qianfan_ocr: '千帆 OCR',
    etl4llm: 'ETL4LLM',
    marker: 'Marker',
    paddle_vl: 'PaddleOCR-VL',
    textin: 'TextIn',
    olmocr: 'OLMOCR',
    docling: 'Docling',
    mineru: 'MinerU',
    magicpdf: 'MagicPDF',
  }
  return labels[key] || key
}

export function SystemStatusSection({
  status,
  backendMeta,
}: Readonly<SystemStatusSectionProps>) {
  const parserEntries = Object.entries(status?.parsers || {})
  const availableParserCount = parserEntries.filter(
    ([, info]) => info.available
  ).length

  return (
    <section className="space-y-3">
      {status ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StatusItem
            label="主数据库"
            systemName="PostgreSQL"
            positive={status.database.connected}
            positiveLabel="已连接"
            negativeLabel="未连接"
            detail={status.database.message}
          />
          <StatusItem
            label="向量数据库"
            systemName="Milvus"
            positive={status.milvus.connected}
            positiveLabel="已连接"
            negativeLabel="未连接"
            detail={status.milvus.message}
          />
          <StatusItem
            label="对话模型"
            positive={status.llm.configured}
            positiveLabel="已配置"
            negativeLabel="未配置"
            detail={status.llm.model}
          />
          <StatusItem
            label="向量模型"
            positive={status.embedding.configured}
            positiveLabel="已配置"
            negativeLabel="未配置"
            detail={status.embedding.model}
          />
        </div>
      ) : null}

      {backendMeta || parserEntries.length ? (
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Server className="size-4 text-primary" aria-hidden="true" />
                运行能力
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                查看接口版本和文档解析能力。
              </p>
            </div>
            {backendMeta ? (
              <dl className="grid min-w-0 gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground sm:grid-cols-[auto_auto]">
                <dt>接口版本</dt>
                <dd className="break-all text-right font-medium text-foreground">
                  {backendMeta.api_version}
                </dd>
                {backendMeta.build?.sha ? (
                  <>
                    <dt>构建版本</dt>
                    <dd className="break-all text-right font-medium text-foreground">
                      {backendMeta.build.sha.slice(0, 7)}
                    </dd>
                  </>
                ) : null}
                {backendMeta.runtime?.python ? (
                  <>
                    <dt>运行环境</dt>
                    <dd className="break-all text-right font-medium text-foreground">
                      Python {backendMeta.runtime.python}
                    </dd>
                  </>
                ) : null}
              </dl>
            ) : null}
          </div>

          {parserEntries.length ? (
            <details className="group mt-3 border-t border-border pt-3">
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 text-sm font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>文档解析能力</span>
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {availableParserCount}/{parserEntries.length} 可用
                  <ChevronDown
                    className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </span>
              </summary>
              <div className="mt-2 grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-3">
                {parserEntries.map(([key, info]) => {
                  const stateLabel = info.available
                    ? '可用'
                    : info.enabled
                      ? '环境不可用'
                      : '未启用'
                  return (
                    <div
                      key={key}
                      className="min-w-0 bg-card px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-medium text-foreground">
                          {formatParserName(key)}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-xs font-medium',
                            info.available
                              ? 'text-success'
                              : info.enabled
                                ? 'text-destructive'
                                : 'text-muted-foreground'
                          )}
                        >
                          {stateLabel}
                        </span>
                      </div>
                      {info.message ? (
                        <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                          {info.message}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
