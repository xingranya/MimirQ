'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Panel } from '@/components/ui/panel'
import { scimApi } from '@/lib/api'
import { formatApiError } from '@/lib/api-errors'
import { readClientStorage } from '@/lib/client-storage'
import { cn, detachPromise } from '@/lib/utils'

const SETTINGS_IDENTITY_PANEL_CLASS =
  'overflow-hidden rounded-md border border-border bg-card'
const SETTINGS_IDENTITY_LABEL_CLASS =
  'text-xs font-medium text-muted-foreground'
const SETTINGS_IDENTITY_INPUT_CLASS =
  'h-9 rounded-md border-border bg-background text-sm'
const SETTINGS_IDENTITY_ICON_CLASS =
  'flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'

export function ScimProvisioningPanel() {
  const [tenantId, setTenantId] = useState('')
  const [scimToken, setScimToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    const storedTenant = readClientStorage('mimirq_tenant_id')
    if (storedTenant) setTenantId(storedTenant)
  }, [])

  const base = { tenantId: tenantId.trim(), scimToken: scimToken.trim() }
  const baseDisabled = Boolean(busy) || !base.tenantId || !base.scimToken
  const configured = Boolean(base.tenantId && base.scimToken)

  async function runAction(
    key: string,
    title: string,
    action: () => Promise<unknown>
  ) {
    setBusy(key)
    try {
      await action()
      toast.success(`${title}完成`)
    } catch (error) {
      toast.error(formatApiError(error, `${title}失败`))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel
      padding="sm"
      className={SETTINGS_IDENTITY_PANEL_CLASS}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className={SETTINGS_IDENTITY_ICON_CLASS}>
            <Users className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              <span>SCIM 同步</span>
              <span
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs font-medium',
                  configured
                    ? 'border-success/20 bg-success/10 text-success'
                    : 'border-border bg-muted/40 text-muted-foreground'
                )}
              >
                {configured ? '可测试' : '未启用'}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              同步企业成员和成员组，保持账号状态一致。
            </p>
          </div>
        </div>
        <div className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <span
              className={cn(
                'size-1.5 rounded-sm',
                configured ? 'bg-success' : 'bg-muted-foreground/45'
              )}
            />
          )}
          <span>{busy ? '连接测试中' : configured ? '凭据已填写' : '等待配置'}</span>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.4fr)_auto] lg:items-end">
          <Field
            label="组织标识"
            helper="用于确认当前组织，确保同步内容写入正确的空间。"
          >
            <Input
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              className={SETTINGS_IDENTITY_INPUT_CLASS}
              placeholder="输入组织标识"
            />
          </Field>
          <Field
            label="SCIM 访问令牌"
            helper="用于验证 SCIM 服务连接，页面不会显示令牌内容。"
          >
            <Input
              type="password"
              value={scimToken}
              onChange={(event) => setScimToken(event.target.value)}
              className={SETTINGS_IDENTITY_INPUT_CLASS}
              placeholder="输入访问令牌"
            />
          </Field>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <ActionButton
              busy={busy === 'provider'}
              disabled={baseDisabled}
              label="测试连接"
              onClick={() =>
                runAction('provider', 'SCIM 服务配置', () =>
                  scimApi.getServiceProviderConfig(base)
                )
              }
            />
          </div>
        </div>
      </div>
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
  label,
  onClick,
}: Readonly<{
  busy: boolean
  disabled: boolean
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
      ) : null}
      {label}
    </Button>
  )
}
