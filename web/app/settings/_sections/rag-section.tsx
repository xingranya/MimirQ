'use client'

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import { SettingsHelpTooltip } from '@/components/settings/settings-help-tooltip'
import type { SystemSettings } from '@/lib/api'
import { RERANKER_PROVIDER_OPTIONS } from '@/lib/reranker-provider-options'
import { Sliders } from 'lucide-react'
import { cn } from '@/lib/utils'
import { systemPageTokens } from '@/components/ui/system-page-tokens'

type RagSettings = NonNullable<SystemSettings['rag']>

type RagSectionProps = {
  rag: RagSettings
  updateRag: (patch: Partial<RagSettings>) => void
}

const RANGE_INPUT_CLASS =
  'h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/18 accent-[hsl(var(--primary))] outline-none transition-colors hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow-[0_2px_8px_hsl(var(--primary)/0.28)] [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-primary/18 [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-primary/18 [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_2px_8px_hsl(var(--primary)/0.28)]'
const DEFAULT_RERANKER_PROVIDER = 'llm'

function getRerankerProviderLabel(value: string): string {
  return RERANKER_PROVIDER_OPTIONS.find((option) => option.key === value)?.label ?? '大模型重排'
}

export function RagSection({ rag, updateRag }: Readonly<RagSectionProps>) {
  const isBm25IndexEnabled = rag.bm25_index_enabled
  const isRerankerEnabled = rag.enable_reranker
  const showImageInAnswer = rag.show_image_in_answer
  const rerankerProviderValue = rag.reranker_provider || DEFAULT_RERANKER_PROVIDER
  const rerankerProviderLabel = getRerankerProviderLabel(rerankerProviderValue)

  return (
    <section>
      <h2
        className={cn(
          'mb-2 flex items-center gap-2 text-[13px] font-medium',
          systemPageTokens.heading
        )}
      >
        <Sliders className="h-3.5 w-3.5 text-primary" />
        检索增强生成参数（RAG）
      </h2>

      <div className="rounded-[16px] border border-border/60 bg-card/82 p-3.5 shadow-sm">
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div
                className={cn(
                  systemPageTokens.microLabel,
                  'text-foreground/80'
                )}
              >
                召回 Top K
              </div>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {rag.retrieval_top_k}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={rag.retrieval_top_k}
              onChange={(event) =>
                updateRag({
                  retrieval_top_k: Number.parseInt(event.target.value, 10),
                })
              }
              className={RANGE_INPUT_CLASS}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              每次检索返回的最相关文档片段数量
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div
                className={cn(
                  systemPageTokens.microLabel,
                  'text-foreground/80'
                )}
              >
                相似度阈值
              </div>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {rag.similarity_threshold.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={rag.similarity_threshold}
              onChange={(event) =>
                updateRag({
                  similarity_threshold: Number.parseFloat(event.target.value),
                })
              }
              className={RANGE_INPUT_CLASS}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              过滤掉相关性得分低于此值的片段
            </p>
          </div>

          <div className="rounded-[13px] border border-border bg-muted/25 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  className={cn(systemPageTokens.microLabel, 'text-foreground')}
                >
                  BM25 关键字检索
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  启用关键词通道，对精确词匹配召回更友好
                  <SettingsHelpTooltip label="BM25 检索模式说明" className="ml-1 size-7">
                    用于混合检索和关键词检索，适合匹配标题、术语、编号和精确关键词。
                  </SettingsHelpTooltip>
                </div>
              </div>
              <SettingsSwitch
                aria-label="切换 BM25 检索"
                checked={isBm25IndexEnabled}
                onCheckedChange={(checked) =>
                  updateRag({ bm25_index_enabled: checked })
                }
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              关闭后将不会使用或构建 BM25 索引
              <SettingsHelpTooltip label="关闭 BM25 的影响" className="ml-1 size-7">
                更省内存和 CPU，但可能降低关键词类问题的召回质量
              </SettingsHelpTooltip>
            </p>
          </div>

          <div className="rounded-[13px] border border-border bg-muted/25 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  className={cn(systemPageTokens.microLabel, 'text-foreground')}
                >
                  启用重排序
                  <SettingsHelpTooltip label="重排序说明" className="ml-1 size-7">
                    重排序模型会对候选片段再次排序，适合改善复杂问题的答案质量。
                  </SettingsHelpTooltip>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  用重排序模型对候选片段二次排序
                  <SettingsHelpTooltip label="重排序成本说明" className="ml-1 size-7">
                    通常可提升答案质量，但会增加检索链路延迟和模型调用成本
                  </SettingsHelpTooltip>
                </div>
              </div>
              <SettingsSwitch
                aria-label="切换重排器"
                checked={isRerankerEnabled}
                onCheckedChange={(checked) =>
                  updateRag({ enable_reranker: checked })
                }
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              开启后会使用下方重排服务与数量，并同步到实验页面作为默认值
            </p>
          </div>

          <div className="rounded-[13px] border border-primary/20 bg-primary/8 p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={cn(systemPageTokens.microLabel, 'text-foreground')}>
                  回答附图
                  <SettingsHelpTooltip label="回答附图说明" className="ml-1 size-7">
                    召回结果命中图片证据时，在答案末尾附上图片引用，便于用户核对图表、截图和版面证据
                  </SettingsHelpTooltip>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  只影响问答结果展示，不改变解析、切块或向量索引
                </div>
              </div>
              <SettingsSwitch
                aria-label="切换回答附图"
                checked={showImageInAnswer}
                onCheckedChange={(checked) =>
                  updateRag({ show_image_in_answer: checked })
                }
              />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={cn(systemPageTokens.microLabel, 'shrink-0 text-foreground/75')}>
                最多附图
              </span>
              <Input
                type="number"
                min={0}
                max={10}
                value={rag.image_append_max}
                disabled={!showImageInAnswer}
                onChange={(event) =>
                  updateRag({
                    image_append_max: Math.max(
                      0,
                      Math.min(10, Number.parseInt(event.target.value || '0', 10))
                    ),
                  })
                }
                className="h-8 rounded-[11px] border-border/70 bg-card text-[12px] disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div
                className={cn(
                  systemPageTokens.microLabel,
                  'text-foreground/80'
                )}
              >
                重排服务
              </div>
              <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {rerankerProviderLabel}
              </span>
            </div>
            <Select
              value={rerankerProviderValue}
              onValueChange={(value) => updateRag({ reranker_provider: value })}
            >
              <SelectTrigger className="h-9 rounded-[12px] border-border/70 bg-card text-[12px]">
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
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              保存后作为默认重排服务，实验页只做临时覆盖
              <SettingsHelpTooltip label="重排序服务说明" className="ml-1 size-7">
                这里选择系统默认使用的重排序服务，实验页可以临时覆盖。
              </SettingsHelpTooltip>
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div
                className={cn(
                  systemPageTokens.microLabel,
                  'text-foreground/80'
                )}
              >
                重排数量
              </div>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {rag.reranker_top_n}
              </span>
            </div>
            <Input
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
              className="h-9 rounded-[12px] border-border/70 bg-card text-[12px]"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              保存后作为默认重排数量，建议保持 10-50
              <SettingsHelpTooltip label="重排序数量说明" className="ml-1 size-7">
                控制每次进入重排序阶段的候选片段数量。
              </SettingsHelpTooltip>
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div
                className={cn(
                  systemPageTokens.microLabel,
                  'text-foreground/80'
                )}
              >
                分块大小
              </div>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {rag.chunk_size}
              </span>
            </div>
            <input
              type="range"
              min="200"
              max="4000"
              step="100"
              value={rag.chunk_size}
              onChange={(event) =>
                updateRag({
                  chunk_size: Number.parseInt(event.target.value, 10),
                })
              }
              className={RANGE_INPUT_CLASS}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              文档分块的目标字符数
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div
                className={cn(
                  systemPageTokens.microLabel,
                  'text-foreground/80'
                )}
              >
                分块重叠
              </div>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {rag.chunk_overlap}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1000"
              step="50"
              value={rag.chunk_overlap}
              onChange={(event) =>
                updateRag({
                  chunk_overlap: Number.parseInt(event.target.value, 10),
                })
              }
              className={RANGE_INPUT_CLASS}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              相邻分块的重叠字符数
              <SettingsHelpTooltip label="分块重叠说明" className="ml-1 size-7">
                分块是写入索引的文本片段。增加重叠可以保留更多上下文，但也会增大索引。
              </SettingsHelpTooltip>
            </p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <div
                className={cn(
                  systemPageTokens.microLabel,
                  'text-foreground/80'
                )}
              >
                最小分块长度
              </div>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {rag.chunk_min_chars}
              </span>
            </div>
            <Input
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
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              入库时丢弃过短分块
              <SettingsHelpTooltip label="最小分块长度说明" className="ml-1 size-7">
                0 表示关闭；图片和表格分块会尽量保留，避免误删结构化内容
              </SettingsHelpTooltip>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
