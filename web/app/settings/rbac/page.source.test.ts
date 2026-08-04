import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')
const samlSource = fs.readFileSync(
  path.resolve(__dirname, '../../../components/settings/saml-ops-panel.tsx'),
  'utf8'
)
const scimSource = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../components/settings/scim-provisioning-panel.tsx'
  ),
  'utf8'
)
const selectSource = fs.readFileSync(
  path.resolve(__dirname, '../../../components/ui/select.tsx'),
  'utf8'
)

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

  it('区分成员和邀请的失败、加载与真实空状态', () => {
    expect(source).toContain('const membersUnavailable = Boolean(membersLoadError) && !hasMembersSnapshot')
    expect(source).toContain('Boolean(invitationsLoadError) && !hasInvitationsSnapshot')
    expect(source).toContain('title="成员列表加载失败"')
    expect(source).toContain('title="邀请列表加载失败"')
    expect(source).toContain('正在加载成员…')
    expect(source).toContain('正在加载待处理邀请…')
    expect(source).toContain("hasMemberFilters ? '没有符合条件的成员' : '暂无成员'")
    expect(source).toContain("value={hasMembersSnapshot ? String(adminCount) : '--'}")
    expect(source).toContain('onRetry={() => membersQuery.refetch()}')
    expect(source).toContain('onRetry={() => invitationsQuery.refetch()}')
  })

  it('为手机和桌面分别提供可操作的成员列表', () => {
    expect(source).toContain('mt-3 space-y-2 xl:hidden')
    expect(source).toContain('mt-3 hidden overflow-hidden rounded-md border border-border xl:block')
    expect(source).toContain('<MemberRoleSelect')
    expect(source).toContain('<MemberActionButtons')
  })

  it('仅在角色实际变更后允许保存', () => {
    expect(source).toContain('roleChanged: draft !== currentRole')
    expect(source).toContain('data-rbac-save-role-action="true"')
    expect(source).toContain('!canManageMembers || !uid || !roleChanged || saving || removing')
    expect(source).toContain("roleChanged ? '保存' : '已保存'")
  })

  it('所有角色下拉框通过统一 Portal 显示在弹窗之上', () => {
    expect(source).toContain('<SelectContent>')
    expect(selectSource).toContain('<SelectPrimitive.Portal>')
    expect(selectSource).toContain('UI_LAYER_CLASS.contextual')
  })

  it('成员与企业身份配置使用扁平视觉和对外中文文案', () => {
    const settingsSources = `${source}\n${samlSource}\n${scimSource}`

    expect(settingsSources).not.toMatch(/rounded-\[(?:1\.25|1\.15)rem\]/)
    expect(settingsSources).not.toContain('shadow-[0_12px_30px')
    expect(settingsSources).not.toContain('text-[10px]')
    expect(settingsSources).not.toContain('uppercase tracking-')
    expect(settingsSources).not.toContain('Metadata 生成中')
    expect(settingsSources).not.toContain('租户 ID')
    expect(settingsSources).not.toContain('SCIM Token')
    expect(settingsSources).toContain('下载元数据')
    expect(settingsSources).toContain('组织标识')
    expect(settingsSources).toContain('SCIM 访问令牌')
  })
})
