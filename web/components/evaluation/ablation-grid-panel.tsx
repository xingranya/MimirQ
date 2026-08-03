'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Grid3X3, PlayCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { RegressionAblationGridValue, RegressionRunCreate } from '@/types'

type GridSpec = Record<string, RegressionAblationGridValue[]>
type GridVariant = Record<string, RegressionAblationGridValue>

export const MAX_GRID_COMBINATIONS = 50

const GRID_PARAM_KEYS = [
  'retrieval_profile',
  'enable_query_alias_expansion',
  'query_alias_max_queries',
  'enable_multi_query',
  'multi_query_count',
  'multi_query_temperature',
  'multi_query_max_chars',
  'enable_hyde',
  'enable_hierarchy_recall',
  'hierarchy_family_collapse',
  'hierarchy_family_aggregation',
  'hierarchy_tree_dedup',
  'hierarchy_parent_depth',
  'hierarchy_sibling_window',
  'hierarchy_overfetch_factor',
  'enable_query_rewrite',
  'query_rewrite_strategy',
  'query_rewrite_temperature',
  'query_rewrite_max_chars',
  'sparse_retrieval_enabled',
  'sparse_retrieval_provider',
  'use_llm_judge',
  'skip_empty_contexts',
  'max_cases',
  'top_k',
  'score_threshold',
  'retrieval_mode',
  'alpha',
  'enable_weight_rerank',
  'vector_weight',
  'keyword_weight',
  'mmr_lambda',
  'enable_reranker',
  'reranker_provider',
  'reranker_top_n',
  'fusion_strategy',
  'fusion_budgets',
  'fusion_min_scores',
  'fusion_weights',
  'prompt_template_id',
  'prompt_template_key',
  'prompt_ab_experiment_key',
] satisfies Array<keyof RegressionRunCreate>

const GRID_PARAM_KEY_SET = new Set<string>(GRID_PARAM_KEYS)

const DEFAULT_GRID = `{
  "retrieval_mode": ["hybrid", "vector"],
  "top_k": [10, 20],
  "enable_reranker": [false, true]
}`

function isGridValue(value: unknown): value is RegressionAblationGridValue {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'object' && !Array.isArray(value))
}

function parseGrid(value: string): { grid: GridSpec; variants: GridVariant[]; error: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return { grid: {}, variants: [], error: '参数组合 JSON 格式有误' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      grid: {},
      variants: [],
      error: '参数组合必须是对象，例如 {"top_k":[10,20]}',
    }
  }

  const parsedRecord = parsed as Record<string, unknown>
  const invalidKeys = Object.keys(parsedRecord).filter((key) => !GRID_PARAM_KEY_SET.has(key))
  if (invalidKeys.length) {
    return { grid: {}, variants: [], error: `不支持的参数：${invalidKeys.join(', ')}` }
  }

  const entries = Object.entries(parsedRecord)
    .filter(([key]) => key.trim())
    .map(([key, raw]) => {
      const values = Array.isArray(raw) ? raw.filter(isGridValue) : []
      return [key, values] as const
    })
    .filter(([, values]) => values.length > 0)

  if (!entries.length) return { grid: {}, variants: [], error: '至少配置一个参数数组' }

  const grid = Object.fromEntries(entries.map(([key, values]) => [key, values])) as GridSpec
  const variants: Array<Record<string, RegressionAblationGridValue>> = [{}]
  for (const [key, values] of entries) {
    const next: Array<Record<string, RegressionAblationGridValue>> = []
    for (const variant of variants) {
      for (const item of values) next.push({ ...variant, [key]: item })
    }
    variants.splice(0, variants.length, ...next.slice(0, MAX_GRID_COMBINATIONS + 1))
  }

  return { grid, variants: variants.map((item) => item as GridVariant), error: null }
}

export function AblationGridPanel({
  disabled,
  disabledReason,
  onRunGrid,
  onBatchComplete,
}: Readonly<{
  disabled?: boolean
  disabledReason?: string
  onRunGrid: (grid: GridSpec, maxCombinations: number) => Promise<void>
  onBatchComplete?: () => Promise<void> | void
}>) {
  const [gridText, setGridText] = useState(DEFAULT_GRID)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [batchError, setBatchError] = useState('')
  const { grid, variants, error } = useMemo(() => parseGrid(gridText), [gridText])
  const tooMany = variants.length > MAX_GRID_COMBINATIONS
  const canRun = !disabled && !running && !error && variants.length > 0 && !tooMany

  async function runBatch() {
    if (!canRun) return
    setRunning(true)
    setCompleted(0)
    setBatchError('')
    try {
      await onRunGrid(grid, MAX_GRID_COMBINATIONS)
      setCompleted(variants.length)
      await onBatchComplete?.()
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : '批量创建评测任务失败')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Grid3X3 className="size-4 text-primary" />
            批量参数组合
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            用 JSON 定义参数数组，系统会按组合顺序创建评测任务。一次最多{' '}
            {MAX_GRID_COMBINATIONS} 组。
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs font-medium tabular-nums',
            tooMany ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {variants.length} 组组合
        </span>
      </div>

      <Textarea
        value={gridText}
        onChange={(event) => setGridText(event.target.value)}
        spellCheck={false}
        className="mt-3 min-h-36 rounded-md border-border bg-background font-mono text-xs text-foreground"
      />

      <details className="mt-3 rounded-md border border-border bg-background">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
          查看支持的参数字段
        </summary>
        <div className="border-t border-border px-3 py-2 font-mono text-xs leading-5 text-muted-foreground">
          {GRID_PARAM_KEYS.join(' / ')}
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-h-5 text-xs text-muted-foreground">
          {batchError ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3.5" />
              {batchError}
            </span>
          ) : error ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3.5" />
              {error}
            </span>
          ) : tooMany ? (
            <span className="text-destructive">组合数超过上限，请收窄参数范围。</span>
          ) : disabled && disabledReason ? (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="size-3.5" />
              {disabledReason}
            </span>
          ) : running ? (
            <span>
              正在创建评测任务 {completed}/{variants.length}
            </span>
          ) : (
            <span>
              前 {Math.min(variants.length, 3)} 组预览：
              {variants
                .slice(0, 3)
                .map((item) => JSON.stringify(item))
                .join(' / ')}
            </span>
          )}
        </div>
        <Button
          type="button"
          disabled={!canRun}
          onClick={() => void runBatch()}
          className="h-9 rounded-md"
        >
          <PlayCircle className="size-4" />
          创建 {variants.length} 个评测任务
        </Button>
      </div>
    </section>
  )
}
