'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

export type RagasMetricOption = {
  key: string
  label: string
  hint: string
  category: string
  kind: '模型评分' | '程序计算'
  cost: string
  scopes: Array<'conversation' | 'regression'>
}

export const RAGAS_METRIC_OPTIONS: RagasMetricOption[] = [
  { key: 'faithfulness', label: '忠实度', hint: '检查回答是否忠于检索到的内容', category: '答案质量', kind: '模型评分', cost: '调用模型', scopes: ['conversation', 'regression'] },
  { key: 'response_relevancy', label: '回答相关性', hint: '检查回答是否直接回应问题', category: '答案质量', kind: '模型评分', cost: '调用模型', scopes: ['conversation', 'regression'] },
  { key: 'context_precision', label: '上下文精度', hint: '检查检索内容是否准确且少有干扰', category: '检索质量', kind: '模型评分', cost: '调用模型', scopes: ['conversation', 'regression'] },
  { key: 'atomic_faithfulness', label: '声明支持率', hint: '检查回答中的各项声明是否有证据支持', category: '答案质量', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'hallucination_rate', label: '幻觉风险', hint: '估算回答中缺少证据支持的声明比例', category: '答案质量', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'citation_accuracy', label: '引用准确率', hint: '检查引用是否来自人工标注的标准证据', category: '引用质量', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'citation_coverage', label: '引用覆盖率', hint: '检查人工标注的标准证据是否被引用或召回', category: '引用质量', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'quote_verifiability', label: '引文可核验率', hint: '检查回答中的引文能否在检索内容中找到', category: '引用质量', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'chunk_attribution', label: '证据归因率', hint: '检查回答中的声明有多少得到检索证据支持', category: '证据利用', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'chunk_utilization', label: '证据利用率', hint: '检查检索到的内容有多少被答案实际使用', category: '证据利用', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'noise_sensitivity', label: '噪声敏感度', hint: '检查答案是否受到无关检索内容干扰', category: '稳定性', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'self_knowledge_ratio', label: '无引用答案占比', hint: '统计回答正确但没有引用支持的声明比例', category: '引用质量', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
  { key: 'refusal_correctness', label: '拒答正确率', hint: '检查应当拒答的问题是否得到正确处理', category: '安全合规', kind: '程序计算', cost: '无需模型', scopes: ['regression'] },
]

export function getRagasMetricOptions(scope: 'conversation' | 'regression' = 'conversation'): RagasMetricOption[] {
  return RAGAS_METRIC_OPTIONS.filter((item) => item.scopes.includes(scope))
}

export function ragasMetricLabel(key: string): string {
  return RAGAS_METRIC_OPTIONS.find((item) => item.key === key)?.label || key
}

export function RagasMetricSelector({
  metricKeys,
  onMetricKeysChange,
  disabled = false,
  className,
  itemClassName,
  textWrapClassName,
  labelClassName,
  hintClassName,
  scope = 'conversation',
}: Readonly<{
  metricKeys: string[]
  onMetricKeysChange: (nextKeys: string[]) => void
  disabled?: boolean
  className?: string
  itemClassName?: string
  textWrapClassName?: string
  labelClassName?: string
  hintClassName?: string
  scope?: 'conversation' | 'regression'
}>) {
  const options = getRagasMetricOptions(scope)

  return (
    <div className={cn('space-y-2', className)}>
      {options.map((metric) => (
        <label
          key={metric.key}
          className={cn(
            'flex items-start gap-2.5 rounded-lg border border-border/70 bg-card px-2.5 py-1.5',
            disabled && 'opacity-60',
            itemClassName
          )}
        >
          <Checkbox
            checked={metricKeys.includes(metric.key)}
            disabled={disabled}
            onCheckedChange={(checked) => {
              if (checked === true) {
                if (metricKeys.includes(metric.key)) return
                onMetricKeysChange([...metricKeys, metric.key])
                return
              }
              onMetricKeysChange(metricKeys.filter((item) => item !== metric.key))
            }}
          />
          <span className={cn('space-y-0.5', textWrapClassName)}>
            <span className={cn('flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-foreground', labelClassName)}>
              <span>{metric.label}</span>
              <span className="rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{metric.kind}</span>
              <span className="rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{metric.category}</span>
              <span className="rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">{metric.cost}</span>
            </span>
            <span className={cn('block text-[11px] leading-4 text-muted-foreground', hintClassName)}>{metric.hint}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
