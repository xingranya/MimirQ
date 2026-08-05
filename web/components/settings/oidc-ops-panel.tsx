'use client'

import { ExternalLink, KeyRound } from 'lucide-react'

import { IdentityPanel } from '@/components/settings/identity-ops-shared'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { isOidcEnabled } from '@/lib/oidc'
import { getOidcPublicProvidersFromEnv } from '@/lib/oidc-providers'

function providerLabel(provider: { id: string; name?: string }): string {
  return String(provider.name || provider.id).trim()
}

export function OidcOpsPanel() {
  const providers = getOidcPublicProvidersFromEnv()
  const enabled = isOidcEnabled()
  const configuredButDisabled = providers.length > 0 && !enabled
  const visibleProviders = enabled ? providers : []
  const providerSummary = visibleProviders
    .slice(0, 3)
    .map(providerLabel)
    .join('、')
  const extraProviderCount = Math.max(0, visibleProviders.length - 3)

  const status = enabled
    ? `${visibleProviders.length} 个登录入口已发布`
    : configuredButDisabled
      ? '登录入口已停用'
      : '未配置'

  return (
    <IdentityPanel
      icon={KeyRound}
      title="OIDC 企业登录"
      description="让成员使用公司的统一身份账号登录。"
      status={status}
      statusTone={enabled ? 'success' : configuredButDisabled ? 'warning' : 'neutral'}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            {enabled
              ? `${providerSummary}${extraProviderCount ? `等 ${visibleProviders.length} 个身份源` : ''}已显示在登录页。`
              : configuredButDisabled
                ? '身份源参数已经存在，但企业登录入口当前关闭。'
                : '还没有可用的企业登录入口。'}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            该能力由部署环境管理。启用前需要准备身份源地址、应用标识、回调地址和服务端密钥；调整后需重新发布前端。
          </p>
        </div>
        {enabled ? (
          <Button
            asChild
            variant="outline"
            className="h-9 gap-1.5 rounded-md border-border bg-card px-3 text-xs font-medium"
          >
            <Link href="/auth" target="_blank" rel="noopener noreferrer">
              查看登录入口
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
      {enabled ? (
        <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          当前状态只表示登录入口已发布。请在登录页完成一次企业账号登录，确认身份源发现、回调和令牌交换均正常。
        </p>
      ) : null}
    </IdentityPanel>
  )
}
