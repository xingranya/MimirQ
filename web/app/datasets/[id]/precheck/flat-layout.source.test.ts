import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page-client.tsx'), 'utf8')
const routeSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('数据集预检页扁平化契约', () => {
  it('接入共享详情壳层并收敛页面操作', () => {
    expect(pageSource).toContain('<DatasetDetailShell')
    expect(pageSource).toContain('activeSection="precheck"')
    expect(pageSource).toContain('datasetName={dataset?.name}')
    expect(pageSource).toContain('更多操作')
    expect(pageSource).toContain('高级配置')
    expect(pageSource).toContain('生成策略')
    expect(pageSource).toContain('导出 JSON')
    expect(pageSource).toContain('导出 HTML')
    expect(pageSource).toContain('启动预检')
    expect(pageSource).not.toContain('<PageScaffold')
    expect(pageSource).not.toContain('router.push')
  })

  it('保留增量进度和完整操作能力', () => {
    expect(pageSource).toContain('.streamPrecheckScanEvents(')
    expect(pageSource).toContain('startScan')
    expect(pageSource).toContain('cancelScan')
    expect(pageSource).toContain('exportJson')
    expect(pageSource).toContain('exportHtml')
    expect(pageSource).toContain('openPolicy')
  })

  it('移除旧装饰表面、固定高度和用户可见内部英文', () => {
    expect(pageSource).not.toContain('gradient')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('rounded-2xl')
    expect(pageSource).not.toContain('rounded-xl')
    expect(pageSource).not.toContain('rounded-[')
    expect(pageSource).not.toContain('shadow-[')
    expect(pageSource).not.toContain('style={{ height: 790')
    expect(pageSource).not.toContain('LOCAL_SCAN_ENABLED')
    expect(pageSource).not.toContain('RUN STATE')
    expect(pageSource).not.toContain('no run')
    expect(pageSource).not.toContain('Secrets')
    expect(routeSource).toContain('srMessage="正在加载数据集预检结果"')
  })
})
