import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceFiles = [
  'page.tsx',
  'constants.ts',
  'components/summary-cards.tsx',
  'components/quarantine-empty-state.tsx',
  'components/quarantine-detail-panel.tsx',
  'components/quarantine-review-drawer.tsx',
  'components/status-pill.tsx',
]
const sources = Object.fromEntries(
  sourceFiles.map((file) => [file, fs.readFileSync(path.resolve(__dirname, file), 'utf8')])
)
const pageSource = sources['page.tsx']
const combinedSource = Object.values(sources).join('\n')

describe('知识隔离区页面源码契约', () => {
  it('同时加载隔离和失败记录并统一刷新', () => {
    expect(pageSource).toContain("status: 'quarantined'")
    expect(pageSource).toContain("status: 'failed'")
    expect(pageSource).toContain('Promise.all([')
    expect(pageSource).toContain('refetch()')
    expect(pageSource).toContain('refetchFailed()')
  })

  it('保留逐条审核和危险操作保护', () => {
    expect(pageSource).toContain('documentApi.retry')
    expect(pageSource).toContain('documentApi.patchPipeline')
    expect(pageSource).toContain('documentApi.patchUserMetadata')
    expect(pageSource).toContain('documentApi.delete')
    expect(sources['components/quarantine-review-drawer.tsx']).toContain('title="确认永久删除文档"')
  })

  it('移除没有处理逻辑的批量选择入口', () => {
    expect(pageSource).not.toContain('全选隔离记录')
    expect(pageSource).not.toContain('批量审核')
    expect(pageSource).toContain('title="开始审核"')
    expect(pageSource).toContain('打开当前列表中的第一条待审记录')
  })

  it('筛选和表格在窄屏保持可用', () => {
    expect(pageSource).toContain('type="date"')
    expect(pageSource).toContain('min-w-[960px]')
    expect(pageSource).toContain('overflow-x-auto')
    expect(pageSource).toContain('aria-label="上一页"')
    expect(pageSource).toContain('aria-label="下一页"')
  })

  it('使用扁平视觉和上线可用中文', () => {
    expect(combinedSource).not.toContain('backdrop-blur')
    expect(combinedSource).not.toContain('radial-gradient')
    expect(combinedSource).not.toContain('rounded-[')
    expect(combinedSource).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    expect(combinedSource).not.toContain('shadow-[')
    expect(combinedSource).not.toMatch(/text-\[(?:9|10|11)px\]/)
    expect(combinedSource).not.toContain('Audit Inspection')
    expect(combinedSource).not.toContain('物理删除')
    expect(pageSource).not.toContain('退出 Demo')
  })
})
