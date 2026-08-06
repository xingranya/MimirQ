import { describe, expect, it } from 'vitest'

import { resolveKnowledgeImportAvailability } from './knowledge-import-availability'
import type { ConnectorInfo } from '@/types'
import type { TenantAccess } from '@/lib/tenant-permissions'

const editorAccess: TenantAccess = {
  tenant_id: 'tenant-1',
  account_id: 'editor-1',
  role: 'editor',
  permissions: [],
  is_active: true,
  is_current: true,
}

const availableConnectors = ['url_batch', 'web_crawl', 'jira_project'].map((id): ConnectorInfo => ({
  id,
  name: id,
  description: '',
  available: true,
  supports_incremental: true,
  supports_resume: false,
  supports_full_reconcile: false,
  sync_cursor_kind: 'none',
}))

const baseInput = {
  isDevMode: false,
  tenantAccess: editorAccess,
  tenantAccessLoading: false,
  tenantAccessError: false,
  datasetsLoading: false,
  datasetsError: false,
  selectedDatasetWritable: true,
  connectors: availableConnectors,
  connectorsLoading: false,
  connectorsError: false,
}

describe('知识库导入入口可用状态', () => {
  it('允许具备写权限且服务可用的账号导入', () => {
    expect(resolveKnowledgeImportAvailability(baseInput)).toEqual({
      filesDisabledReason: null,
      urlDisabledReason: null,
      canRetry: false,
    })
  })

  it('允许普通成员导入自己的个人知识库', () => {
    const availability = resolveKnowledgeImportAvailability({
      ...baseInput,
      tenantAccess: { ...editorAccess, role: 'viewer' },
    })

    expect(availability.filesDisabledReason).toBeNull()
    expect(availability.urlDisabledReason).toBeNull()
  })

  it('普通成员查看团队知识库时禁用导入入口', () => {
    const availability = resolveKnowledgeImportAvailability({
      ...baseInput,
      tenantAccess: { ...editorAccess, role: 'viewer' },
      selectedDatasetWritable: false,
    })

    expect(availability.filesDisabledReason).toBe('当前知识库为只读，请切换到你的个人知识库')
    expect(availability.urlDisabledReason).toBe('当前知识库为只读，请切换到你的个人知识库')
  })

  it('知识库列表失败时阻止导入并允许重试', () => {
    const availability = resolveKnowledgeImportAvailability({ ...baseInput, datasetsError: true })

    expect(availability.filesDisabledReason).toBe('知识库列表加载失败')
    expect(availability.urlDisabledReason).toBe('知识库列表加载失败')
    expect(availability.canRetry).toBe(true)
  })

  it('仅禁用后端已关闭的网页导入入口', () => {
    const availability = resolveKnowledgeImportAvailability({
      ...baseInput,
      connectors: availableConnectors.map((connector) =>
        connector.id === 'url_batch'
          ? {
              ...connector,
              available: false,
              unavailable_reason: '网页导入服务未启用，请联系管理员',
            }
          : connector
      ),
    })

    expect(availability.filesDisabledReason).toBeNull()
    expect(availability.urlDisabledReason).toBe('网页导入服务未启用，请联系管理员')
  })

  it('连接器目录失败时阻止网页导入并允许重新检查', () => {
    const availability = resolveKnowledgeImportAvailability({ ...baseInput, connectorsError: true })

    expect(availability.filesDisabledReason).toBeNull()
    expect(availability.urlDisabledReason).toBe('暂时无法确认网页导入服务状态')
    expect(availability.canRetry).toBe(true)
  })
})
