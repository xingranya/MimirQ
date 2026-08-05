'use client'

import type { ReactNode } from 'react'
import { Activity, FileSearch, Route } from 'lucide-react'

import { SettingsSwitch } from '@/components/settings/settings-switch'
import { Input } from '@/components/ui/input'
import type { ObservabilityConfig } from '@/lib/api'

type ObservabilitySectionProps = {
  observability: ObservabilityConfig
  updateObservability: (patch: Partial<ObservabilityConfig>) => void
}

function clampPreviewChars(value: string): number {
  const parsed = Number.parseInt(value || '0', 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(5000, parsed))
}

function ObservabilityItem({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
  children,
}: Readonly<{
  icon: typeof FileSearch
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children?: ReactNode
}>) {
  return (
    <div className="px-3 py-3 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-medium text-foreground">{title}</h3>
              <span className="text-xs font-medium text-muted-foreground">
                {checked ? '已开启' : '已关闭'}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <SettingsSwitch
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="shrink-0"
          aria-label={`切换${title}`}
        />
      </div>
      {checked && children ? (
        <div className="mt-3 border-t border-border pt-3 sm:ml-11">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function InlineSwitch({
  label,
  checked,
  onCheckedChange,
}: Readonly<{
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}>) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <span className="text-sm text-foreground">{label}</span>
      <SettingsSwitch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={`切换${label}`}
      />
    </div>
  )
}

function PreviewLimitField({
  id,
  label,
  value,
  onChange,
}: Readonly<{
  id: string
  label: string
  value: number
  onChange: (value: number) => void
}>) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={5000}
        step={100}
        value={value}
        className="h-9 rounded-md border-border bg-background text-sm"
        onChange={(event) => onChange(clampPreviewChars(event.target.value))}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        可填写 0–5000，填 0 时不保留摘要正文。
      </p>
    </div>
  )
}

export function ObservabilitySection({
  observability,
  updateObservability,
}: Readonly<ObservabilitySectionProps>) {
  const toolCallEnabled = observability.tool_call_log_enabled ?? false
  const agentLogEnabled = observability.agent_log_enabled ?? false
  const metricsLogEnabled = observability.metrics_log_enabled ?? false
  const includeToolPreview =
    observability.tool_call_log_include_preview ?? false
  const includeMetricsText = observability.metrics_log_include_text ?? false

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">记录与诊断</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          按排查需要开启。保存后只影响新的请求和任务。
        </p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
        <ObservabilityItem
          icon={FileSearch}
          title="工具调用记录"
          description="记录工具名称、耗时和执行结果，用于定位调用失败或响应缓慢。"
          checked={toolCallEnabled}
          onCheckedChange={(checked) =>
            updateObservability({ tool_call_log_enabled: checked })
          }
        >
          <div className="grid gap-3 md:grid-cols-2 md:items-start">
            <InlineSwitch
              label="保留结果摘要"
              checked={includeToolPreview}
              onCheckedChange={(checked) =>
                updateObservability({
                  tool_call_log_include_preview: checked,
                })
              }
            />
            {includeToolPreview ? (
              <PreviewLimitField
                id="tool-call-preview-limit"
                label="结果摘要字符上限"
                value={observability.tool_call_log_max_preview_chars ?? 500}
                onChange={(value) =>
                  updateObservability({
                    tool_call_log_max_preview_chars: value,
                  })
                }
              />
            ) : null}
          </div>
        </ObservabilityItem>

        <ObservabilityItem
          icon={Route}
          title="任务运行记录"
          description="记录任务总耗时、执行步骤和结果，用于定位任务停滞位置。"
          checked={agentLogEnabled}
          onCheckedChange={(checked) =>
            updateObservability({ agent_log_enabled: checked })
          }
        >
          <div className="grid gap-3 md:grid-cols-2 md:items-start">
            <InlineSwitch
              label="保留执行路径"
              checked={
                observability.agent_log_include_execution_path ?? false
              }
              onCheckedChange={(checked) =>
                updateObservability({
                  agent_log_include_execution_path: checked,
                })
              }
            />
            <PreviewLimitField
              id="task-error-preview-limit"
              label="错误摘要字符上限"
              value={observability.agent_log_max_preview_chars ?? 500}
              onChange={(value) =>
                updateObservability({
                  agent_log_max_preview_chars: value,
                })
              }
            />
          </div>
        </ObservabilityItem>

        <ObservabilityItem
          icon={Activity}
          title="问答过程指标"
          description="记录检索和生成指标，用于趋势分析、问题复盘和审计。"
          checked={metricsLogEnabled}
          onCheckedChange={(checked) =>
            updateObservability({ metrics_log_enabled: checked })
          }
        >
          <InlineSwitch
            label="记录问题与回答原文"
            checked={includeMetricsText}
            onCheckedChange={(checked) =>
              updateObservability({ metrics_log_include_text: checked })
            }
          />
          {includeMetricsText ? (
            <p className="mt-2 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
              问题和回答原文会保存在服务器日志中，可能包含个人信息或业务内容。保存前请确认日志访问权限和保留期限。
            </p>
          ) : null}
        </ObservabilityItem>
      </div>
    </section>
  )
}
