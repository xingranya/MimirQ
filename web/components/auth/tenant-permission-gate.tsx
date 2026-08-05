'use client'

import { LockKeyhole, RefreshCw, ShieldAlert } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { AppFrame } from '@/components/app-frame'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { PageScaffold } from '@/components/ui/page-scaffold'
import { useAuth } from '@/hooks/use-auth'
import { useTenantAccess } from '@/hooks/use-tenant-access'
import { BRAND_CONFIG } from '@/lib/brand'
import { tenantAccessAllows, type TenantPermission } from '@/lib/tenant-permissions'

type TenantPermissionGateProps = {
  permission: TenantPermission
  pageName: string
  children: ReactNode
  /** 父布局已经提供应用壳层时设为 false，避免重复挂载侧栏。 */
  withFrame?: boolean
}

function PermissionGateFrame({
  children,
  withFrame,
}: Readonly<{ children: ReactNode; withFrame: boolean }>) {
  return withFrame ? <AppFrame>{children}</AppFrame> : <>{children}</>
}

export function TenantPermissionGate({
  permission,
  pageName,
  children,
  withFrame = true,
}: Readonly<TenantPermissionGateProps>) {
  const [hasHydrated, setHasHydrated] = useState(false)
  const { isDevMode } = useAuth()
  const access = useTenantAccess()
  const allowed = hasHydrated && (isDevMode || tenantAccessAllows(access.data, permission))

  useEffect(() => {
    setHasHydrated(true)
  }, [])

  if (!hasHydrated || (!isDevMode && access.isLoading)) {
    return (
      <PermissionGateFrame withFrame={withFrame}>
        <PageLoading
          className="min-h-full bg-transparent"
          message="正在校验页面权限..."
          srMessage={`正在校验${pageName}访问权限`}
        />
      </PermissionGateFrame>
    )
  }

  if (!allowed) {
    const isUnknown = access.isError || !access.data
    return (
      <PermissionGateFrame withFrame={withFrame}>
        <PageScaffold
          title={isUnknown ? '无法确认权限' : '无权限访问'}
          description={
            isUnknown
              ? '当前无法读取租户角色，请检查登录状态或后端服务后重试。'
              : `当前角色没有访问「${pageName}」的权限。`
          }
          icon={isUnknown ? ShieldAlert : LockKeyhole}
          size="5xl"
          compact
        >
          <div className="rounded-md border border-border bg-card p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">需要权限：{permission}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  当前角色：{access.data?.role || '未知'}。如需访问，请发送邮件至{' '}
                  <a
                    href={BRAND_CONFIG.contactHref}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    {BRAND_CONFIG.contactEmail}
                  </a>
                  ，由管理员调整成员角色。
                </p>
              </div>
              <Button variant="outline" className="gap-2 self-start" onClick={() => access.refetch()}>
                <RefreshCw className="size-4" />
                重新校验
              </Button>
            </div>
          </div>
        </PageScaffold>
      </PermissionGateFrame>
    )
  }

  return <>{children}</>
}
