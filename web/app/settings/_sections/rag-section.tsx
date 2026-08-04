'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { SettingsHelpTooltip } from '@/components/settings/settings-help-tooltip'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { settingsTextTokens } from '@/components/ui/system-page-tokens'
import type { SystemSettings } from '@/lib/api'
import { RERANKER_PROVIDER_OPTIONS } from '@/lib/reranker-provider-options'
import { cn } from '@/lib/utils'

type RagSettings = NonNullable<SystemSettings['rag']>

type RagSectionProps = {
  rag: RagSettings
  updateRag: (patch: Partial<RagSettings>) => void
}

const RANGE_INPUT_CLASS =
  'h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--primary))] outline-none transition-colors hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-muted [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary'
const DEFAULT_RERANKER_PROVIDER = 'llm'
const FIELD_INPUT_CLASS = 'h-9 rounded-md border-border bg-background text-sm'

function getRerankerProviderLabel(value: string): string {
  return RERANKER_PROVIDER_OPTIONS.find((option) => option.key === value)?.label ?? '大模型重排'
}

function RangeField({
  id,
  label,
  value,
  displayValue,
  min,
  max,
  step,
  description,
  onValueChange,
}: Readonly<{
  id: string
  label: string
  value: number
  displayValue?: string
  min: number
  max: number
  step?: number
  description: ReactNode
  onValueChange: (value: number) => void
}>) {
  const descriptionId = `${id}-description`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className={settingsTextTokens.fieldLabel} htmlFor={id}>
          {label}
        </label>
        <output className="text-xs font-medium tabular-nums text-foreground" htmlFor={id}>
          {displayValue ?? value}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={descriptionId}
        onChange={(event) => onValueChange(Number(event.target.value))}
        className={RANGE_INPUT_CLASS}
      />
      <p id={descriptionId} className={settingsTextTokens.helpText}>
        {description}
      </p>
    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  ariaLabel,
  children,
}: Readonly<{
  title: ReactNode
  description: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  ariaLabel: string
  children?: ReactNode
}>) {
  return (
    <div className="border-t border-border first:border-t-0">
      <div className="flex min-h-14 items-start justify-between gap-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className={cn(settingsTextTokens.helpText, 'mt-1')}>{description}</div>
        </div>
        <SettingsSwitch
          aria-label={ariaLabel}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="shrink-0"
        />
      </div>
      {children ? <div className="pb-3">{children}</div> : null}
    </div>
  )
}

export function RagSection({ rag, updateRag }: Readonly<RagSectionProps>) {
  const isBm25IndexEnabled = rag.bm25_index_enabled
  const isRerankerEnabled = rag.enable_reranker
  const showImageInAnswer = rag.show_image_in_answer
  const rerankerProviderValue = rag.reranker_provider || DEFAULT_RERANKER_PROVIDER
  const rerankerProviderLabel = getRerankerProviderLabel(rerankerProviderValue)

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="p-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">基础检索</h3>
          <p className={cn(settingsTextTokens.helpText, 'mt-1')}>
            控制每次检索的候选数量和最低相关性。修改后会影响后续问答。
          </p>
        </div>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <RangeField
            id="rag-retrieval-top-k"
            label="召回数量"
            value={rag.retrieval_top_k}
            min={1}
            max={20}
            description="每次检索返回的相关片段数量。"
            onValueChange={(retrievalTopK) => updateRag({ retrieval_top_k: retrievalTopK })}
          />
          <RangeField
            id="rag-similarity-threshold"
            label="相似度阈值"
            value={rag.similarity_threshold}
            displayValue={rag.similarity_threshold.toFixed(1)}
            min={0}
            max={1}
            step={0.1}
            description="低于该分数的片段不会进入回答。"
            onValueChange={(similarityThreshold) =>
              updateRag({ similarity_threshold: similarityThreshold })
            }
          />
        </div>
      </div>

      <div className="border-t border-border px-4 py-1">
        <ToggleRow
          title={
            <>
              BM25 关键词检索
              <SettingsHelpTooltip label="BM25 检索模式说明" className="ml-1 size-7">
                适合匹配标题、术语、编号和精确关键词，并可与向量检索组合使用。
              </SettingsHelpTooltip>
            </>
          }
          description={
            isBm25IndexEnabled
              ? '关键词检索已加入召回流程。'
              : '关闭后不会构建或使用 BM25 索引。'
          }
          checked={isBm25IndexEnabled}
          onCheckedChange={(checked) => updateRag({ bm25_index_enabled: checked })}
          ariaLabel="切换 BM25 检索"
        />

        <ToggleRow
          title={
            <>
              重排序
              <SettingsHelpTooltip label="重排序说明" className="ml-1 size-7">
                重排序会再次评估候选片段，通常能改善复杂问题的答案质量，但会增加处理时间。
              </SettingsHelpTooltip>
            </>
          }
          description={
            isRerankerEnabled
              ? `当前使用${rerankerProviderLabel}。`
              : '关闭后按原始召回顺序生成答案。'
          }
          checked={isRerankerEnabled}
          onCheckedChange={(checked) => updateRag({ enable_reranker: checked })}
          ariaLabel="切换重排器"
        >
          <details className="group rounded-md border border-border bg-muted/20 px-3 py-2">
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span>重排序参数</span>
              <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                {rerankerProviderLabel} · {rag.reranker_top_n} 条
                <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </span>
            </summary>
            <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={settingsTextTokens.fieldLabel} htmlFor="rag-reranker-provider">
                  重排服务
                </label>
                <Select
                  value={rerankerProviderValue}
                  onValueChange={(value) => updateRag({ reranker_provider: value })}
                >
                  <SelectTrigger
                    id="rag-reranker-provider"
                    className={FIELD_INPUT_CLASS}
                    aria-label="选择重排服务"
                  >
                    <SelectValue placeholder="选择重排服务" />
                  </SelectTrigger>
                  <SelectContent>
                    {RERANKER_PROVIDER_OPTIONS.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="space-y-1.5" htmlFor="rag-reranker-top-n">
                <span className={settingsTextTokens.fieldLabel}>候选片段数量</span>
                <Input
                  id="rag-reranker-top-n"
                  type="number"
                  min={1}
                  max={200}
                  value={rag.reranker_top_n}
                  onChange={(event) =>
                    updateRag({
                      reranker_top_n: Math.max(
                        1,
                        Math.min(200, Number.parseInt(event.target.value || '1', 10))
                      ),
                    })
                  }
                  className={FIELD_INPUT_CLASS}
                />
              </label>
            </div>
          </details>
        </ToggleRow>

        <ToggleRow
          title={
            <>
              回答附图
              <SettingsHelpTooltip label="回答附图说明" className="ml-1 size-7">
                命中图片证据时，在答案末尾附上引用，便于核对图表、截图和版面内容。
              </SettingsHelpTooltip>
            </>
          }
          description="只影响问答结果展示，不会改变解析、分块或向量索引。"
          checked={showImageInAnswer}
          onCheckedChange={(checked) => updateRag({ show_image_in_answer: checked })}
          ariaLabel="切换回答附图"
        >
          {showImageInAnswer ? (
            <label
              className="grid max-w-sm gap-1.5 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center"
              htmlFor="rag-image-append-max"
            >
              <span>
                <span className="block text-sm font-medium text-foreground">每次最多附图</span>
                <span className={settingsTextTokens.helpText}>可填写 0 到 10。</span>
              </span>
              <Input
                id="rag-image-append-max"
                type="number"
                min={0}
                max={10}
                value={rag.image_append_max}
                onChange={(event) =>
                  updateRag({
                    image_append_max: Math.max(
                      0,
                      Math.min(10, Number.parseInt(event.target.value || '0', 10))
                    ),
                  })
                }
                className={FIELD_INPUT_CLASS}
              />
            </label>
          ) : null}
        </ToggleRow>
      </div>

      <details className="group border-t border-border p-4">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span>高级分块参数</span>
          <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            分块 {rag.chunk_size} · 重叠 {rag.chunk_overlap}
            <ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </span>
        </summary>
        <div className="mt-4 grid gap-5 border-t border-border pt-4 md:grid-cols-2 xl:grid-cols-3">
          <RangeField
            id="rag-chunk-size"
            label="分块大小"
            value={rag.chunk_size}
            min={200}
            max={4000}
            step={100}
            description="文档分块的目标字符数。"
            onValueChange={(chunkSize) => updateRag({ chunk_size: chunkSize })}
          />
          <RangeField
            id="rag-chunk-overlap"
            label="分块重叠"
            value={rag.chunk_overlap}
            min={0}
            max={1000}
            step={50}
            description={
              <>
                保留相邻片段的上下文，但会增加索引体积。
                <SettingsHelpTooltip label="分块重叠说明" className="ml-1 size-7">
                  图片和表格分块会尽量保留，减少结构化内容被截断的情况。
                </SettingsHelpTooltip>
              </>
            }
            onValueChange={(chunkOverlap) => updateRag({ chunk_overlap: chunkOverlap })}
          />
          <label className="space-y-1.5" htmlFor="rag-chunk-min-chars">
            <span className={settingsTextTokens.fieldLabel}>最小分块长度</span>
            <Input
              id="rag-chunk-min-chars"
              type="number"
              min={0}
              max={5000}
              value={rag.chunk_min_chars}
              onChange={(event) =>
                updateRag({
                  chunk_min_chars: Math.max(
                    0,
                    Number.parseInt(event.target.value || '0', 10)
                  ),
                })
              }
              className={FIELD_INPUT_CLASS}
            />
            <span className={cn(settingsTextTokens.helpText, 'block')}>
              入库时丢弃过短片段，0 表示保留全部。
            </span>
          </label>
        </div>
      </details>
    </section>
  )
}
