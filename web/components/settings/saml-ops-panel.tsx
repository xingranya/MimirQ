'use client'

import { useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import {
  IDENTITY_INPUT_CLASS,
  IdentityActionButton,
  IdentityField,
  IdentityNotice,
  IdentityPanel,
} from '@/components/settings/identity-ops-shared'
import { Input } from '@/components/ui/input'
import { authApi } from '@/lib/api'
import { toApiErrorInfo } from '@/lib/api-errors'

type SamlStatus = 'idle' | 'checking' | 'ready' | 'unconfigured' | 'error'

type SamlNotice = {
  tone: 'warning' | 'error'
  message: string
}

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
  const normalized = message.trim().toLowerCase()
  return normalized === 'saml not configured' || normalized === 'not found'
}

function samlFailureNotice(message: string): SamlNotice {
  const normalized = message.trim().toLowerCase()
  if (isSamlNotConfiguredMessage(message)) {
    return {
      tone: 'warning',
      message: 'SAML 尚未启用。请先由部署人员添加身份源地址、回调地址和证书。',
    }
  }
  if (normalized.includes('provider_id required')) {
    return {
      tone: 'warning',
      message: '当前配置了多个身份源。请填写要检查的身份源标识。',
    }
  }
  if (normalized.includes('unknown saml provider')) {
    return {
      tone: 'warning',
      message: '没有找到这个身份源。请核对身份源标识后重试。',
    }
  }
  return {
    tone: 'error',
    message: '暂时无法读取 SAML 元数据。请检查身份服务和后端连接后重试。',
  }
}

export function SamlOpsPanel() {
  const [providerId, setProviderId] = useState('')
  const [status, setStatus] = useState<SamlStatus>('idle')
  const [notice, setNotice] = useState<SamlNotice | null>(null)

  async function downloadMetadata() {
    setStatus('checking')
    setNotice(null)
    try {
      const xml = await authApi.samlMetadata({
        provider_id: provider || null,
      })
      downloadText(xml, `saml-metadata.${provider || 'default'}.xml`)
      setStatus('ready')
      toast.success('SAML 元数据已下载')
    } catch (error) {
      const info = toApiErrorInfo(error, 'SAML 元数据读取失败')
      const nextNotice = samlFailureNotice(info.message)
      setStatus(nextNotice.tone === 'warning' ? 'unconfigured' : 'error')
      setNotice(nextNotice)
      if (nextNotice.tone === 'warning') toast.warning(nextNotice.message)
      else toast.error(nextNotice.message)
    }
  }

  const provider = providerId.trim()
  const statusMeta = {
    idle: { label: '待检查', tone: 'neutral' as const },
    checking: { label: '正在检查', tone: 'progress' as const },
    ready: { label: '元数据可用', tone: 'success' as const },
    unconfigured: { label: '尚未可用', tone: 'warning' as const },
    error: { label: '检查失败', tone: 'error' as const },
  }[status]

  return (
    <IdentityPanel
      icon={ShieldCheck}
      title="SAML 单点登录"
      description="连接企业身份源，并下载接入时需要的服务元数据。"
      status={statusMeta.label}
      statusTone={statusMeta.tone}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
        <IdentityField
          id="saml-provider-id"
          label="身份源标识"
          helper="留空时检查默认身份源；连接多个身份源时填写对应标识。"
        >
          <Input
            id="saml-provider-id"
            value={providerId}
            onChange={(event) => {
              setProviderId(event.target.value)
              setStatus('idle')
              setNotice(null)
            }}
            className={IDENTITY_INPUT_CLASS}
            placeholder="使用默认身份源"
          />
        </IdentityField>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <IdentityActionButton
            icon={Download}
            busy={status === 'checking'}
            disabled={status === 'checking'}
            label="检查并下载元数据"
            onClick={downloadMetadata}
          />
        </div>
      </div>
      {notice ? (
        <IdentityNotice tone={notice.tone}>{notice.message}</IdentityNotice>
      ) : null}
      <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
        元数据可下载只表示服务配置已生效。上线前仍需从企业身份源完成一次登录，确认回调、证书和成员映射正常。
      </p>
    </IdentityPanel>
  )
}
