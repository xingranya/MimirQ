import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')
const retentionSource = fs.readFileSync(
  path.resolve(__dirname, '../../components/audit/audit-retention-panel.tsx'),
  'utf8'
)
const combinedSource = `${pageSource}\n${retentionSource}`

describe('审计日志页面源码契约', () => {
  it('保留日志查询、筛选选项和分页链路', () => {
    expect(pageSource).toContain('auditApi.listLogs')
    expect(pageSource).toContain('AUDIT_FILTER_OPTION_MAX_PAGES')
    expect(pageSource).toContain('placeholderData: (previousData) => previousData')
    expect(pageSource).toContain('handlePageSizeChange')
    expect(pageSource).toContain('AUDIT_PAGE_SIZE_OPTIONS')
  })

  it('筛选请求期间隔离旧结果，并在失败后提供准确恢复入口', () => {
    expect(pageSource).toContain(
      'logsQuery.isPlaceholderData ? null : (logsQuery.data ?? null)'
    )
    expect(pageSource).toContain('setExpandedId(null)')
    expect(pageSource).toContain('setSelectedIds([])')
    expect(pageSource).toContain('当前显示上次成功结果')
    expect(pageSource).toContain('title="无法加载审计日志"')
    expect(pageSource).toContain('{resp && (')
  })

  it('默认收起高级筛选并保留快速筛选', () => {
    expect(pageSource).toContain('useState(false)')
    expect(pageSource).toContain('setShowAdvanced(!showAdvanced)')
    expect(pageSource).toContain("setFilterValue('action', p.action)")
    expect(pageSource).toContain('清除筛选')
  })

  it('保留权限、删除确认和保留策略保护', () => {
    expect(pageSource).toContain('TENANT_PERMISSIONS.AUDIT_MANAGE')
    expect(pageSource).toContain('auditApi.bulkDeleteLogs')
    expect(pageSource).toContain('title="确认批量删除审计日志"')
    expect(retentionSource).toContain('dryRun')
    expect(retentionSource).toContain('auditApi.purgeLogs')
    expect(retentionSource).toContain('title="确认清理审计日志"')
  })

  it('表格和操作在窄屏保持可用', () => {
    expect(pageSource).toContain('min-w-[960px]')
    expect(pageSource).toContain('max-h-[640px] overflow-auto')
    expect(pageSource).toContain('size-8 rounded-md')
    expect(pageSource).toContain('查看原始审计数据')
  })

  it('使用扁平视觉和上线可用中文', () => {
    expect(combinedSource).not.toContain('backdrop-blur')
    expect(combinedSource).not.toContain('linear-gradient')
    expect(combinedSource).not.toContain('rounded-[')
    expect(combinedSource).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    expect(combinedSource).not.toContain('shadow-[')
    expect(combinedSource).not.toMatch(/text-\[(?:9|10|11)px\]/)
    expect(pageSource).not.toContain('按后端审计日志')
    expect(retentionSource).not.toContain('audit.manage 权限')
    expect(retentionSource).not.toContain('Bytes')
  })
})
