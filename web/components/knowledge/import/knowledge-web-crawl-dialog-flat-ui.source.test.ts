import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'knowledge-web-crawl-dialog.tsx'), 'utf8')

describe('网页抓取弹窗视觉与交互契约', () => {
  it('使用中文任务文案和扁平滚动布局', () => {
    expect(source).toContain('<DialogTitle>抓取网站内容</DialogTitle>')
    expect(source).toContain('grid-rows-[auto,1fr,auto]')
    expect(source).toContain('min-h-0 overflow-y-auto')
    expect(source).not.toMatch(
      /<DialogTitle>Website Crawl|>Start URLs|>Max pages|>Start<|>Cancel</
    )
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)|backdrop-blur|shadow-(?:sm|lg|xl|soft|strong)/)
  })

  it('高级能力默认折叠但保持可访问', () => {
    expect(source).toContain('<summary')
    expect(source).toContain('抓取规则')
    expect(source).toContain('认证方式')
    expect(source).toContain('访问权限')
    expect(source).toContain('解析与入库')
  })

  it('数值控件与后端边界一致', () => {
    expect(source).toContain('max={500}')
    expect(source).toContain('max={10}')
    expect(source).not.toContain('max={5000}')
    expect(source).not.toContain('max={50}')
  })

  it('字段使用可读标签和明确的提交状态', () => {
    expect(source).toContain('htmlFor="web-crawl-start-urls"')
    expect(source).toContain('id="web-crawl-max-pages"')
    expect(source).toContain('aria-live="polite"')
    expect(source).toContain('aria-invalid={startUrlsInvalid}')
    expect(source).toContain('!validStartUrlCount || hasBlockingError')
    expect(source).toContain("submitting ? '正在创建任务' : '创建抓取任务'")
  })
})
