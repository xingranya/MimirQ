import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const actionsSource = readFileSync(resolve(__dirname, '../knowledge-workbench-actions.tsx'), 'utf8')
const menuSource = readFileSync(resolve(__dirname, 'knowledge-import-menu.tsx'), 'utf8')
const pageSource = readFileSync(resolve(__dirname, '../knowledge-page.tsx'), 'utf8')

describe('知识库导入入口状态契约', () => {
  it('同时读取租户权限、连接器目录和知识库错误状态', () => {
    expect(actionsSource).toContain('useTenantAccess()')
    expect(actionsSource).toContain('connectorApi.listConnectors()')
    expect(actionsSource).toContain('resolveKnowledgeImportAvailability')
    expect(pageSource).toContain('error: datasetsError')
    expect(pageSource).toContain('refreshDatasets={refreshDatasets}')
  })

  it('禁用不可用入口并提供明确原因和重试', () => {
    expect(menuSource).toContain('disabled={Boolean(filesDisabledReason)}')
    expect(menuSource).toContain('disabled={Boolean(urlDisabledReason)}')
    expect(menuSource).toContain('role="status"')
    expect(menuSource).toContain('重新检查')
  })
})
