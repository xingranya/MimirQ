import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(__dirname, 'page-client.tsx'), 'utf8')

describe('知识反馈页面源码契约', () => {
  it('保留反馈查询、归档与回归用例能力', () => {
    expect(source).toContain('feedbackApi.listEnriched')
    expect(source).toContain('feedbackApi.loopCandidates')
    expect(source).toContain('feedbackApi.update')
    expect(source).toContain('feedbackApi.toRegressionCase')
    expect(source).toContain('/history?id=${encodeURIComponent')
  })

  it('保留类型、星级、来源、时间和状态筛选', () => {
    expect(source).toContain('setFilterType')
    expect(source).toContain('setRatingFilter')
    expect(source).toContain('setSourceFilter')
    expect(source).toContain('setTimeRange')
    expect(source).toContain('setBoardTab')
  })

  it('分页和操作在窄屏保持可用', () => {
    expect(source).toContain('aria-label="上一页"')
    expect(source).toContain('aria-label="下一页"')
    expect(source).toContain('sm:flex-row')
    expect(source).toContain('sm:grid-cols-2')
  })

  it('用列表分布替代装饰性圆环图', () => {
    expect(source).toContain('FeedbackDistributionPanel')
    expect(source).not.toContain('FeedbackDonutCard')
    expect(source).not.toContain('conic-gradient')
  })

  it('使用扁平视觉和上线可用中文', () => {
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)/)
    expect(source).not.toContain('shadow-[')
    expect(source).not.toMatch(/text-\[(?:9|10|11)px\]/)
    expect(source).not.toContain('退出 Demo')
    expect(source).not.toContain('Copy JSON')
    expect(source).not.toContain('User Feedback')
    expect(source).not.toContain('Expected Output')
    expect(source).not.toContain('AI Response')
    expect(source).not.toContain('HardNeg')
  })
})
