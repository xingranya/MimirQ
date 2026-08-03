import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

describe('检索监控页面源码契约', () => {
  it('保留运行概览和查询分析数据链路', () => {
    expect(source).toContain('observabilityApi.getRagMetricsSummary')
    expect(source).toContain('observabilityApi.getRagQueryAnalytics')
    expect(source).toContain("enabled: tab === 'summary'")
    expect(source).toContain("enabled: tab === 'query_analytics'")
    expect(source).toContain('placeholderData: keepPreviousData')
  })

  it('将筛选和刷新集中到标题下方工具栏', () => {
    expect(source).toContain('时间范围')
    expect(source).toContain('慢查询标准')
    expect(source).toContain('aria-label="选择时间范围"')
    expect(source).toContain('aria-label="选择慢查询标准"')
    expect(source).toContain('刷新数据')
    expect(source).toContain('<Link href="/settings">监控设置</Link>')
  })

  it('所有图表使用安全响应式容器', () => {
    expect(source).toContain('<SafeResponsiveChart')
    expect(source).not.toContain('<ResponsiveContainer')
  })

  it('使用中文指标和可恢复的空状态', () => {
    expect(source).toContain('运行概览')
    expect(source).toContain('查询分析')
    expect(source).toContain('零命中率')
    expect(source).toContain('慢查询率')
    expect(source).toContain('查询指纹已复制')
    expect(source).toContain('发起一次使用知识检索的对话后，再刷新本页查看统计。')
    expect(source).not.toContain('暂无 Query Analytics 数据')
    expect(source).not.toContain('ENABLE_METRICS_LOG=false')
    expect(source).not.toContain('owner/admin')
  })

  it('使用扁平视觉并去除原始 JSON 结果块', () => {
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('shadow-[')
    expect(source).not.toMatch(/text-\[(?:9|10|11)px\]/)
    expect(source).not.toContain('JSON.stringify(summary.retrieval_mode_counts')
    expect(source).toContain('<MetricBreakdown data={summary.retrieval_mode_counts} />')
    expect(source).toContain('<MetricBreakdown data={summary.hit_type_counts} />')
  })
})
