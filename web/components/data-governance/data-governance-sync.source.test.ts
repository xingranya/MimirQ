import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const panelSource = readFileSync(resolve(__dirname, '../data-governance-panel.tsx'), 'utf8')

describe('数据治理文档同步契约', () => {
  it('加载、失败和重试共用查询状态，并按当前数据集判断是否保留旧结果', () => {
    expect(panelSource).toContain('documentSyncQuery.isPending')
    expect(panelSource).toContain('documentSyncQuery.isError')
    expect(panelSource).toContain('documentSyncQuery.data?.failedSources')
    expect(panelSource).toContain('hasFiles={scopedFiles.length > 0}')
    expect(panelSource).toContain('documentSyncQuery.refetch()')
  })
})
