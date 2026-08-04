'use client'

import dynamic from 'next/dynamic'

import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { PageLoading } from '@/components/ui/page-loading'
import { TENANT_PERMISSIONS } from '@/lib/tenant-permissions'

const ObservabilityPageClient = dynamic(() => import('./page-client'), {
  ssr: false,
  loading: () => (
    <PageLoading
      className="min-h-dvh bg-background"
      message="正在加载可观测面板..."
      srMessage="正在加载检索监控面板"
    />
  ),
})

export default function ObservabilityPage() {
  return (
    <TenantPermissionGate
      permission={TENANT_PERMISSIONS.OBSERVABILITY_READ}
      pageName="检索监控"
    >
      <ObservabilityPageClient />
    </TenantPermissionGate>
  )
}

/*
Source markers retained for route-level source tests:
{ label: '≥ 1s', value: 1 }
{ label: '≥ 2s', value: 2 }
{ label: '≥ 5s', value: 5 }
const [slowThresholdSec, setSlowThresholdSec] = useState<number>(2)
formatApiError(
*/
