import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = fs.readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8')
const quotaSource = fs.readFileSync(
  path.resolve(__dirname, '../../components/usage/tenant-quota-panel.tsx'),
  'utf8'
)
const combinedSource = `${pageSource}\n${quotaSource}`

describe('用量与配额页面源码契约', () => {
  it('保留用量、成本、配额和数据集名称查询', () => {
    expect(pageSource).toContain('usageApi.getChatTokenUsageSummary')
    expect(pageSource).toContain('usageApi.getChatCostUsageSummary')
    expect(pageSource).toContain('usageApi.getChatTokenQuotaStatus')
    expect(pageSource).toContain('datasetApi.listAll')
    expect(quotaSource).toContain('usageApi.getTenantQuotaSummary')
  })

  it('保留时间筛选、统一刷新和数据集跳转', () => {
    expect(pageSource).toContain('aria-label="选择统计时间"')
    expect(pageSource).toContain('refreshUsage')
    expect(pageSource).toContain('刷新')
    expect(pageSource).toContain('buildDatasetKnowledgeHref')
    expect(pageSource).toContain('查看数据集')
  })

  it('为加载失败和空数据提供可见反馈', () => {
    expect(pageSource).toContain('role="alert"')
    expect(pageSource).toContain('用量数据加载失败，请稍后重试')
    expect(pageSource).toContain('统计期内还没有可显示的对话用量。')
    expect(pageSource).toContain('统计期内还没有可显示的成本数据。')
    expect(quotaSource).toContain('暂时没有配额数据，请刷新后重试。')
  })

  it('使用自然中文描述用量和配额', () => {
    expect(pageSource).toContain('用量与配额')
    expect(pageSource).toContain('回答令牌')
    expect(pageSource).toContain('向量化令牌')
    expect(quotaSource).toContain('向量化字符')
    expect(quotaSource).toContain('请求频率')
    expect(pageSource).not.toContain('LLM TOKEN')
    expect(pageSource).not.toContain('NO DATASET ID')
    expect(quotaSource).not.toContain('后端未启用')
  })

  it('移除旧式毛玻璃、光晕、大圆角和覆盖式按钮', () => {
    expect(combinedSource).not.toContain('backdrop-blur')
    expect(combinedSource).not.toContain('blur-[')
    expect(combinedSource).not.toContain('rounded-[')
    expect(combinedSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(combinedSource).not.toContain('shadow-[')
    expect(combinedSource).not.toContain('hover:-translate')
    expect(combinedSource).not.toMatch(/text-\[(?:9|10|11)px\]/)
    expect(quotaSource).not.toContain('absolute right-')
  })
})
