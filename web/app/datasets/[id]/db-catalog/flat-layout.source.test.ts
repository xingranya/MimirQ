import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('数据集数据库目录页扁平化契约', () => {
  it('接入共享详情壳层并收敛页面操作', () => {
    expect(pageSource).toContain('<DatasetDetailShell')
    expect(pageSource).toContain('activeSection="db-catalog"')
    expect(pageSource).toContain('datasetName={dataset?.name}')
    expect(pageSource).toContain('新建同步')
    expect(pageSource).toContain('更多操作')
    expect(pageSource).toContain('打开导入任务')
    expect(pageSource).not.toContain('<PageScaffold')
  })

  it('保留目录列表、表详情、画像和同步任务接口', () => {
    expect(pageSource).toContain('datasetApi.listDbCatalogTables')
    expect(pageSource).toContain('datasetApi.getDbCatalogTable')
    expect(pageSource).toContain('datasetApi.listDbCatalogProfiles')
    expect(pageSource).toContain('connectorApi.createRun')
    expect(pageSource).toContain('结构变化')
    expect(pageSource).toContain('<QueryErrorState')
  })

  it('移动端使用自然滚动并为结构表提供局部横向滚动', () => {
    expect(pageSource).toContain('overflow-y-auto xl:overflow-hidden')
    expect(pageSource).toContain('grid-cols-1')
    expect(pageSource).toContain('overflow-x-auto rounded-md border border-border')
    expect(pageSource).toContain('min-w-[560px]')
  })

  it('同步弹窗使用中文标签并在关闭时清除密码', () => {
    expect(pageSource).toContain('数据库目录同步')
    expect(pageSource).toContain('主机地址')
    expect(pageSource).toContain('最多同步表数')
    expect(pageSource).toContain("setSyncPassword('')")
    expect(pageSource).toContain('aria-label="启用安全画像"')
    expect(pageSource).toContain('max={65535}')
    expect(pageSource).toContain('max={2000}')
    expect(pageSource).not.toContain('formatApiError')
  })

  it('移除旧装饰表面和用户可见内部状态', () => {
    expect(pageSource).not.toContain('gradient')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('rounded-2xl')
    expect(pageSource).not.toContain('rounded-xl')
    expect(pageSource).not.toContain('rounded-[')
    expect(pageSource).not.toContain('shadow-[')
    expect(pageSource).not.toContain('text-[11px]')
    expect(pageSource).not.toContain('schema diff')
    expect(pageSource).not.toContain('profile enabled')
  })
})
