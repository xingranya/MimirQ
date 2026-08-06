import { describe, expect, it } from 'vitest'

import {
  tenantAccessCanCreateDatasets,
  tenantAccessCanEditDatasets,
  tenantAccessCanWriteDataset,
  type TenantAccess,
} from './tenant-permissions'

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

  it('允许普通成员创建和写入自己的个人知识库', () => {
    const viewer = createAccess('viewer')

    expect(tenantAccessCanCreateDatasets(viewer)).toBe(true)
    expect(
      tenantAccessCanWriteDataset(viewer, {
        owner_id: viewer.account_id,
        permission: 'only_me',
      })
    ).toBe(true)
  })

  it('普通成员对分组分配的团队知识库保持只读', () => {
    const viewer = createAccess('viewer')

    expect(
      tenantAccessCanWriteDataset(viewer, {
        owner_id: 'admin-1',
        permission: 'partial_members',
      })
    ).toBe(false)
    expect(
      tenantAccessCanWriteDataset(viewer, {
        owner_id: viewer.account_id,
        permission: 'all_team_members',
      })
    ).toBe(false)
  })

  it('审计员不能创建知识库', () => {
    expect(tenantAccessCanCreateDatasets(createAccess('auditor'))).toBe(false)
  })
})
