'use client'

import { AppFrame } from '@/components/app-frame'
import { TenantPermissionGate } from '@/components/auth/tenant-permission-gate'
import { IndustryRulesWorkbench } from '@/components/industry-rules/industry-rules-workbench'
import { TENANT_PERMISSIONS } from '@/lib/tenant-permissions'

export default function IndustryRulesPage() {
  return (
    <TenantPermissionGate
      permission={TENANT_PERMISSIONS.SETTINGS_READ}
      pageName="行业规则库"
    >
      <AppFrame>
        <IndustryRulesWorkbench />
      </AppFrame>
    </TenantPermissionGate>
  )
}
