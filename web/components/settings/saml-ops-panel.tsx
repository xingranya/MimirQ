'use client'

import { useState, type ReactNode } from 'react'
import { Download, Loader2, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/panel'
import { authApi } from '@/lib/api'
import { formatApiError, toApiErrorInfo } from '@/lib/api-errors'
import { cn, detachPromise } from '@/lib/utils'

const SETTINGS_IDENTITY_PANEL_CLASS =
  'overflow-hidden rounded-md border border-border bg-card'
const SETTINGS_IDENTITY_LABEL_CLASS =
  'text-xs font-medium text-muted-foreground'
const SETTINGS_IDENTITY_INPUT_CLASS =
  'h-9 rounded-md border-border bg-background text-sm'
const SETTINGS_IDENTITY_ICON_CLASS =
  'flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  globalThis.window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function isSamlNotConfiguredMessage(message: string): boolean {
  return message.trim().toLowerCase() === 'saml not configured'
}

export function SamlOpsPanel() {
  const [providerId, setProviderId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function runAction(
    key: string,
    title: string,
    action: () => Promise<unknown>
  ) {
    setBusy(key)
    try {
      await action()
      setNotice(null)
      toast.success(`${title}完成`)
    } catch (error) {
      const info = toApiErrorInfo(error, `${title}失败`)
      if (isSamlNotConfiguredMessage(info.message)) {
        setNotice('身份源尚未配置：请先完成 SAML 身份源配置，再下载元数据')
        toast.warning('身份源尚未配置，暂时无法下载元数据')
        return
      }

      setNotice(null)
      toast.error(formatApiError(error, `${title}失败`))
    } finally {
      setBusy(null)
    }
  }

  const provider = providerId.trim()

  return (
    <Panel
      padding="sm"
      className={SETTINGS_IDENTITY_PANEL_CLASS}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className={SETTINGS_IDENTITY_ICON_CLASS}>
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              <span>SAML 单点登录</span>
              <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                按需配置
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              连接企业身份源，统一登录方式和成员访问权限。
            </p>
          </div>
        </div>
        <div className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <span className="size-1.5 rounded-sm bg-muted-foreground/45" />
          )}
          <span>{busy ? '正在生成元数据' : '等待配置身份源'}</span>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
          <Field
            label="身份源标识"
            helper="留空时使用默认身份源；连接多个身份源时填写对应标识。"
          >
            <Input
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              className={cn(SETTINGS_IDENTITY_INPUT_CLASS, 'min-w-[220px]')}
              placeholder="使用默认身份源"
            />
          </Field>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <ActionButton
              icon={Download}
              busy={busy === 'metadata'}
              disabled={Boolean(busy)}
              label="下载元数据"
              onClick={() =>
                runAction('metadata', '获取 SAML 元数据', async () => {
                  const xml = await authApi.samlMetadata({
                    provider_id: provider || null,
                  })
                  downloadText(xml, `saml-metadata.${provider || 'default'}.xml`)
                  return {
                    provider_id: provider || null,
                    chars: xml.length,
                    preview: xml.slice(0, 2000),
                  }
                })
              }
            />
          </div>
        </div>
      </div>
      {notice ? (
        <div className="mt-3 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-sm font-medium leading-5 text-warning">
          {notice}
        </div>
      ) : null}
    </Panel>
  )
}

function Field({
  label,
  helper,
  children,
}: Readonly<{ label: string; helper?: string; children: ReactNode }>) {
  return (
    <div className="space-y-1.5">
      <Label className={SETTINGS_IDENTITY_LABEL_CLASS}>
        {label}
      </Label>
      {children}
      {helper ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {helper}
        </p>
      ) : null}
    </div>
  )
}

function ActionButton({
  busy,
  disabled,
  icon: Icon,
  label,
  onClick,
}: Readonly<{
  busy: boolean
  disabled: boolean
  icon: LucideIcon
  label: string
  onClick: () => Promise<void>
}>) {
  return (
    <Button
      variant="outline"
      className="h-9 gap-1.5 rounded-md border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted disabled:bg-muted/50 disabled:text-muted-foreground"
      disabled={disabled}
      onClick={() => detachPromise(onClick())}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  )
}
