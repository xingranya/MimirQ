import { describe, expect, it } from 'vitest'

import { tenantAccessCanEditDatasets, type TenantAccess } from './tenant-permissions'

function createAccess(role: string, isActive = true): TenantAccess {
  return {
    tenant_id: 'tenant-1',
    account_id: 'account-1',
    role,
    permissions: [],
    is_active: isActive,
    is_current: true,
  }
}

describe('知识库编辑角色', () => {
  it.each(['owner', 'admin', 'editor', 'dataset_operator'])('允许 %s 导入知识库', (role) => {
    expect(tenantAccessCanEditDatasets(createAccess(role))).toBe(true)
  })

  it.each(['viewer', 'auditor', 'unknown'])('拒绝 %s 导入知识库', (role) => {
    expect(tenantAccessCanEditDatasets(createAccess(role))).toBe(false)
  })

  it('拒绝已停用或缺失的租户成员关系', () => {
    expect(tenantAccessCanEditDatasets(createAccess('owner', false))).toBe(false)
    expect(tenantAccessCanEditDatasets(undefined)).toBe(false)
  })
})
