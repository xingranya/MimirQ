'use client'

import { DangerZonePanel } from '@/components/settings/danger-zone-panel'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import { Input } from '@/components/ui/input'
import { settingsTextTokens } from '@/components/ui/system-page-tokens'
import type { CacheConfig, ChatConfig, LangGraphConfig, SafetyConfig } from '@/lib/api'
import { Database, EyeOff, Network, Server } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type RuntimeControlsSectionProps = {
  chat: ChatConfig
  updateChat: (patch: Partial<ChatConfig>) => void
  cache: CacheConfig
  updateCache: (patch: Partial<CacheConfig>) => void
  safety: SafetyConfig
  updateSafety: (patch: Partial<SafetyConfig>) => void
  langgraph: LangGraphConfig
  updateLangGraph: (patch: Partial<LangGraphConfig>) => void
}

const RUNTIME_LABEL = settingsTextTokens.fieldLabel
const RUNTIME_HINT = settingsTextTokens.helpText
const RUNTIME_INPUT = 'h-9 rounded-md border-border bg-background text-sm'

function RuntimeToggle({
  checked,
  onToggle,
  label,
}: Readonly<{ checked: boolean; onToggle: () => void; label: string }>) {
  return (
    <SettingsSwitch
      checked={checked}
      onCheckedChange={() => onToggle()}
      className="shrink-0"
      aria-label={label}
    />
  )
}

function RuntimeCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: Readonly<{
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  children?: ReactNode
}>) {
  return (
    <div className="min-w-0 border-b border-border py-4 xl:px-4 xl:[&:nth-child(odd)]:border-r">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  )
}

function OptionRow({
  title,
  description,
  checked,
  onToggle,
  label,
}: Readonly<{
  title: string
  description: string
  checked: boolean
  onToggle: () => void
  label: string
}>) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border py-3">
      <div className="min-w-0">
        <div className={settingsTextTokens.panelTitle}>{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <RuntimeToggle checked={checked} onToggle={onToggle} label={label} />
    </div>
  )
}

function Field({
  id,
  label,
  children,
  hint,
}: Readonly<{ id: string; label: string; children: ReactNode; hint?: string }>) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={RUNTIME_LABEL}>{label}</label>
      {children}
      {hint ? <p className={RUNTIME_HINT}>{hint}</p> : null}
    </div>
  )
}

export function RuntimeControlsSection({
  chat,
  updateChat,
  cache,
  updateCache,
  safety,
  updateSafety,
  langgraph,
  updateLangGraph,
}: Readonly<RuntimeControlsSectionProps>) {
  const isCancelOnDisconnectEnabled = chat.stream_cancel_on_disconnect ?? true
  const isUploadDedupEnabled = cache.upload_dedup_enabled ?? false
  const isChatResponseCacheEnabled = cache.chat_response_cache_enabled ?? false
  const isPiiRedactionEnabled = safety.pii_redaction_enabled ?? false
  const isSubgraphEnabled = langgraph.use_subgraphs ?? false

  return (
    <DangerZonePanel
      title="运行控制"
      impact="会影响对话长连接、上传去重、响应缓存、敏感信息脱敏和流程编排；建议只在排障或上线前窗口调整"
      badge="高影响配置"
      compact
      tone="neutral"
      icon="help"
    >
      <section className="grid border-t border-border xl:grid-cols-2">
        <RuntimeCard
        icon={Server}
        title="对话流式稳定性"
        description="心跳保活连接，断连后自动释放资源"
        action={
          <RuntimeToggle
            checked={isCancelOnDisconnectEnabled}
            onToggle={() =>
              updateChat({
                stream_cancel_on_disconnect: !isCancelOnDisconnectEnabled,
              })
            }
            label="切换断连自动取消"
          />
        }
      >
        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          <Field id="runtime-heartbeat-sec" label="心跳间隔（秒）" hint="0 表示禁用，不推荐。">
            <Input
              id="runtime-heartbeat-sec"
              type="number"
              min={0}
              max={120}
              step={1}
              value={chat.stream_heartbeat_sec ?? 10}
              onChange={(event) =>
                updateChat({ stream_heartbeat_sec: Number.parseFloat(event.target.value || '0') })
              }
              className={RUNTIME_INPUT}
            />
          </Field>
          <p className="border-t border-border pt-3 text-sm leading-6 text-muted-foreground sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            适合经过代理或负载均衡的长连接场景，避免空闲连接被误断。
          </p>
        </div>
      </RuntimeCard>

      <RuntimeCard
        icon={Database}
        title="性能与缓存"
        description="去重与缓存用于减少重复处理，缓存服务不可用时不会阻断主流程。"
      >
        <div className="grid gap-2">
          <OptionRow
            title="上传去重"
            description="同文件指纹和管线配置时复用已有文档"
            checked={isUploadDedupEnabled}
            onToggle={() => updateCache({ upload_dedup_enabled: !isUploadDedupEnabled })}
            label="切换上传去重"
          />
          <OptionRow
            title="对话响应缓存"
            description="相同问题、范围和配置命中后直接返回"
            checked={isChatResponseCacheEnabled}
            onToggle={() =>
              updateCache({ chat_response_cache_enabled: !isChatResponseCacheEnabled })
            }
            label="切换对话响应缓存"
          />
        </div>

        {isChatResponseCacheEnabled ? (
          <div className="grid gap-3 border-t border-primary/25 pt-3 md:grid-cols-3">
            <Field id="runtime-cache-ttl" label="缓存时长（秒）">
              <Input
                id="runtime-cache-ttl"
                type="number"
                min={0}
                max={86400}
                value={cache.chat_response_cache_ttl_sec ?? 300}
                onChange={(event) =>
                  updateCache({
                    chat_response_cache_ttl_sec: Number.parseInt(event.target.value || '0', 10),
                  })
                }
                className={RUNTIME_INPUT}
              />
            </Field>
            <Field id="runtime-cache-max-bytes" label="单条结果最大字节数">
              <Input
                id="runtime-cache-max-bytes"
                type="number"
                min={0}
                max={5000000}
                value={cache.chat_response_cache_max_value_bytes ?? 200000}
                onChange={(event) =>
                  updateCache({
                    chat_response_cache_max_value_bytes: Number.parseInt(
                      event.target.value || '0',
                      10
                    ),
                  })
                }
                className={RUNTIME_INPUT}
              />
            </Field>
            <div className="flex items-center justify-between gap-3 pt-5 text-sm font-medium text-muted-foreground">
              <span>仅无历史</span>
              <SettingsSwitch
                checked={cache.chat_response_cache_require_empty_history ?? true}
                onCheckedChange={(checked) =>
                  updateCache({ chat_response_cache_require_empty_history: checked })
                }
                aria-label="切换仅缓存无历史对话"
              />
            </div>
          </div>
        ) : null}
      </RuntimeCard>

      <RuntimeCard
        icon={EyeOff}
        title="敏感信息脱敏"
        description="对模型输入、输出和工具调用做敏感信息遮蔽"
        action={
          <RuntimeToggle
            checked={isPiiRedactionEnabled}
            onToggle={() => updateSafety({ pii_redaction_enabled: !isPiiRedactionEnabled })}
            label="切换敏感信息脱敏"
          />
        }
      >
        {isPiiRedactionEnabled ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field id="runtime-pii-mask" label="脱敏占位符">
              <Input
                id="runtime-pii-mask"
                value={safety.pii_redaction_mask ?? '[REDACTED]'}
                onChange={(event) => updateSafety({ pii_redaction_mask: event.target.value })}
                className={RUNTIME_INPUT}
              />
            </Field>
            <Field id="runtime-pii-holdback" label="流式缓冲字符数">
              <Input
                id="runtime-pii-holdback"
                type="number"
                min={0}
                max={2048}
                value={safety.pii_stream_holdback_chars ?? 128}
                onChange={(event) =>
                  updateSafety({
                    pii_stream_holdback_chars: Number.parseInt(event.target.value || '0', 10),
                  })
                }
                className={RUNTIME_INPUT}
              />
            </Field>
          </div>
        ) : null}
      </RuntimeCard>

      <RuntimeCard
        icon={Network}
        title="流程拆分"
        description="将检索和生成拆成独立步骤，便于定位问题和调整流程。"
        action={
          <RuntimeToggle
            checked={isSubgraphEnabled}
            onToggle={() => updateLangGraph({ use_subgraphs: !isSubgraphEnabled })}
            label="切换子图编排"
          />
        }
      />
      </section>
    </DangerZonePanel>
  )
}
