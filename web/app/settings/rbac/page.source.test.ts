import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')

describe('成员管理页面源码契约', () => {
  it('提供受权限保护的邀请链接流程', () => {
    expect(source).toContain('TENANT_PERMISSIONS.SETTINGS_WRITE')
    expect(source).toContain('rbacApi.createTenantInvitation')
    expect(source).toContain('/auth/invite#token=')
    expect(source).toContain('邀请公司成员')
    expect(source).toContain('globalThis.navigator.clipboard.writeText(inviteLink)')
  })

  it('展示待处理邀请并支持按邀请 ID 撤销', () => {
    expect(source).toContain('rbacApi.listTenantInvitations')
    expect(source).toContain('rbacApi.revokeTenantInvitation')
    expect(source).toContain('待处理邀请')
    expect(source).toContain('撤销邀请')
  })
})
