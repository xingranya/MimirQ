'use client'

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { toast } from 'sonner'

import {
  IDENTITY_INPUT_CLASS,
  IdentityActionButton,
  IdentityField,
  IdentityNotice,
  IdentityPanel,
} from '@/components/settings/identity-ops-shared'
import { Input } from '@/components/ui/input'
import { scimApi } from '@/lib/api'
import { toApiErrorInfo } from '@/lib/api-errors'
import { readClientStorage } from '@/lib/client-storage'

type ScimStatus = 'idle' | 'testing' | 'connected' | 'error'

function scimFailureMessage(status?: number): string {
  if (status === 404) {
    return 'SCIM 服务尚未启用。请先由部署人员开启成员同步并配置访问令牌。'
  }
  if (status === 401) return '访问令牌无效。请更换令牌后重新验证。'
  if (status === 403) {
    return '当前请求不在允许范围内。请检查组织标识和访问来源限制。'
  }
  return '暂时无法连接 SCIM 服务。请检查后端状态后重试。'
}

export function ScimProvisioningPanel() {
  const [tenantId, setTenantId] = useState('')
  const [scimToken, setScimToken] = useState('')
  const [status, setStatus] = useState<ScimStatus>('idle')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const storedTenant = readClientStorage('mimirq_tenant_id')
    if (storedTenant) setTenantId(storedTenant)
  }, [])

  const base = { tenantId: tenantId.trim(), scimToken: scimToken.trim() }
  const hasCredentials = Boolean(base.tenantId && base.scimToken)

  function invalidateConnection() {
    setStatus('idle')
    setNotice(null)
  }

  async function testConnection() {
    setStatus('testing')
    setNotice(null)
    try {
      await scimApi.getServiceProviderConfig(base)
      setStatus('connected')
      setNotice('连接成功。当前凭据可以读取 SCIM 服务能力。')
      toast.success('SCIM 连接验证通过')
    } catch (error) {
      const info = toApiErrorInfo(error, 'SCIM 连接失败')
      const message = scimFailureMessage(info.status)
      setStatus('error')
      setNotice(message)
      toast.error(message)
    }
  }

  const statusMeta = {
    idle: {
      label: hasCredentials ? '待验证' : '未填写凭据',
      tone: 'neutral' as const,
    },
    testing: { label: '正在验证', tone: 'progress' as const },
    connected: { label: '已连接', tone: 'success' as const },
    error: { label: '连接失败', tone: 'error' as const },
  }[status]

  return (
    <IdentityPanel
      icon={Users}
      title="SCIM 成员同步"
      description="从企业目录同步成员和成员组状态。"
      status={statusMeta.label}
      statusTone={statusMeta.tone}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.4fr)_auto] lg:items-end">
        <IdentityField
          id="scim-tenant-id"
          label="组织标识"
          helper="必须与服务端绑定的组织一致。"
        >
          <Input
            id="scim-tenant-id"
            value={tenantId}
            onChange={(event) => {
              setTenantId(event.target.value)
              invalidateConnection()
            }}
            className={IDENTITY_INPUT_CLASS}
            placeholder="输入组织标识"
          />
        </IdentityField>
        <IdentityField
          id="scim-access-token"
          label="SCIM 访问令牌"
          helper="仅用于本次连接验证，不会保存在浏览器中。"
        >
          <Input
            id="scim-access-token"
            type="password"
            autoComplete="new-password"
            value={scimToken}
            onChange={(event) => {
              setScimToken(event.target.value)
              invalidateConnection()
            }}
            className={IDENTITY_INPUT_CLASS}
            placeholder="输入访问令牌"
          />
        </IdentityField>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <IdentityActionButton
            busy={status === 'testing'}
            disabled={status === 'testing' || !hasCredentials}
            label="验证连接"
            onClick={testConnection}
          />
        </div>
      </div>
      {notice ? (
        <IdentityNotice tone={status === 'connected' ? 'success' : 'error'}>
          {notice}
        </IdentityNotice>
      ) : null}
      <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        连接验证只读取服务能力，不会创建、修改或停用成员。正式同步由企业身份平台调用 SCIM 地址完成。
      </p>
    </IdentityPanel>
  )
}
