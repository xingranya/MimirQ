import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const listSource = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')
const detailSource = fs.readFileSync(
  path.resolve(__dirname, '[id]/page.tsx'),
  'utf8'
)

describe('成员组页面源码契约', () => {
  it('保留成员组及成员维护接口', () => {
    expect(listSource).toContain('groupApi.listGroups')
    expect(listSource).toContain('groupApi.createGroup')
    expect(listSource).toContain('groupApi.deleteGroup')
    expect(detailSource).toContain('groupApi.patchGroup')
    expect(detailSource).toContain('groupApi.addGroupMembers')
    expect(detailSource).toContain('groupApi.removeGroupMembers')
  })

  it('查看和修改使用独立权限门禁', () => {
    const sources = `${listSource}\n${detailSource}`

    expect(sources).toContain('TENANT_PERMISSIONS.SETTINGS_READ')
    expect(sources).toContain('tenantAccessAllows')
    expect(sources).toContain('TENANT_PERMISSIONS.SETTINGS_WRITE')
    expect(listSource).toContain('disabled={!canManageGroups}')
    expect(detailSource).toContain('disabled={!canManageGroups || !canSaveGroup || savingGroup}')
  })

  it('成员组列表和成员列表均提供移动端布局', () => {
    expect(listSource).toContain('space-y-2 overflow-y-auto p-3 lg:hidden')
    expect(listSource).toContain('hidden min-h-0 flex-1 flex-col overflow-y-auto lg:flex')
    expect(detailSource).toContain('space-y-2 lg:hidden')
    expect(detailSource).toContain('hidden overflow-hidden rounded-md border border-border lg:block')
  })

  it('仅允许保存实际修改并保护未保存内容', () => {
    expect(detailSource).toContain('const groupHasChanges = useMemo')
    expect(detailSource).toContain('return groupHasChanges')
    expect(detailSource).toContain('useUnsavedNavigationGuard')
    expect(detailSource).toContain('<UnsavedChangesDialog')
    expect(detailSource).toContain("navigationGuard.requestNavigation('/settings/groups')")
  })

  it('成员组详情加载失败时禁止编辑和保存', () => {
    expect(detailSource).toContain('const groupLoadError = groupQuery.isError')
    expect(detailSource).toContain('const canEditGroup = canManageGroups && Boolean(group) && !groupQuery.isError')
    expect(detailSource).toContain('if (!group || groupQuery.isError) return false')
    expect(detailSource).toContain('disabled={!canEditGroup || loadingGroup}')
    expect(detailSource).toContain('成员组详情尚未加载，无法保存。请重新加载后再试。')
    expect(detailSource).toContain('onRetry={() => groupQuery.refetch()}')
  })

  it('区分查询失败、加载中、真实空数据和筛选无结果', () => {
    expect(listSource).toContain('const hasGroupsSnapshot = groupsQuery.data !== undefined')
    expect(listSource).toContain('const groupsUnavailable = Boolean(groupsLoadError) && !hasGroupsSnapshot')
    expect(listSource).toContain('title="成员组加载失败"')
    expect(listSource).toContain('正在加载成员组…')
    expect(listSource).toContain("hasGroups ? '没有匹配的成员组' : '暂无成员组'")
    expect(detailSource).toContain('const hasMembersSnapshot = membersQuery.data !== undefined')
    expect(detailSource).toContain('title="成员列表加载失败"')
    expect(detailSource).toContain('正在加载成员…')
    expect(detailSource).toContain("members.length ? '没有找到匹配的成员' : '该成员组还没有成员'")
    expect(detailSource).toContain('onRetry={() => membersQuery.refetch()}')
  })

  it('使用扁平视觉和对外中文文案', () => {
    const sources = `${listSource}\n${detailSource}`

    expect(sources).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(sources).not.toContain('rounded-[')
    expect(sources).not.toContain('shadow-[')
    expect(sources).not.toMatch(/text-\[(?:9|10|11)px\]/)
    expect(sources).not.toContain('uppercase tracking-')
    expect(sources).not.toContain('按成员 ID（user_id）过滤')
    expect(sources).not.toContain('外部组 ID（external_id）')
    expect(sources).not.toContain('fail-closed')
    expect(sources).toContain('成员组标识')
    expect(sources).toContain('外部目录标识')
  })
})
