import React from 'react'

import { cn } from '@/lib/utils'
import type { CleanPreviewRuleStat } from '@/types'

function getRuleSourceLabel(source: string | null | undefined): string {
  if (source === 'pack') return '场景清洗规则'
  if (source === 'custom' || source === 'profile') return '自定义规则'
  if (source === 'builtin' || source === 'default') return '系统规则'
  return '清洗规则'
}

export function CleanPreviewRuleStatsPanel({
  ruleStats,
  className,
}: Readonly<{
  ruleStats: CleanPreviewRuleStat[] | null | undefined
  className?: string
}>) {
  const stats = Array.isArray(ruleStats) ? ruleStats : []
  const hitsOnly = stats.filter((item) => (Number(item.hits) || 0) > 0)
  const totalHits = hitsOnly.reduce(
    (total, item) => total + (Number(item.hits) || 0),
    0
  )

  return (
    <section
      className={cn(
        'rounded-md border border-border bg-card p-4',
        className
      )}
    >
      <h2 className="text-sm font-semibold text-foreground">命中的清洗规则</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        共命中 {totalHits} 次，涉及 {hitsOnly.length} / {stats.length} 条规则
      </p>

      {hitsOnly.length ? (
        <div className="mt-3 divide-y divide-border border-y border-border">
          {hitsOnly.map((item) => (
            <div
              key={item.index}
              className="flex items-start justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <div className="break-all font-mono text-xs text-foreground">
                  {item.pattern}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {getRuleSourceLabel(item.source)}
                  {item.source === 'pack' && item.pack
                    ? `：${item.pack}`
                    : ''}
                  {Number(item.flags) > 0
                    ? `；匹配选项 ${Number(item.flags)}`
                    : ''}
                  {typeof item.repl === 'string' && item.repl
                    ? `；替换为 ${item.repl}`
                    : ''}
                </div>
              </div>
              <div className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-xs tabular-nums">
                {Number(item.hits) || 0} 次
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-muted-foreground">
          样例内容没有命中清洗规则。
        </div>
      )}
    </section>
  )
}
