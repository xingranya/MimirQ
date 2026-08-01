import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { BRAND_CONFIG } from './brand'

const USER_VISIBLE_SOURCES = [
  'app/layout.tsx',
  'app/manifest.ts',
  'app/auth/page.tsx',
  'app/auth/saml/callback/page.tsx',
  'app/evaluations/page.tsx',
  'app/settings/_sections/dify-integration-section.tsx',
  'components/navbar.tsx',
  'components/chat-area.tsx',
  'components/chat/message-item.tsx',
  'components/rag-trace/rag-trace-panel.tsx',
  'components/knowledge/import/knowledge-jira-project-dialog.tsx',
  'components/knowledge/import/knowledge-web-crawl-dialog.tsx',
  'i18n/messages/zh-CN/chat.ts',
  'i18n/messages/zh-CN/knowledge.ts',
] as const

describe('用户可见品牌', () => {
  it('统一使用见外传媒知识库品牌层级', () => {
    expect(BRAND_CONFIG).toMatchObject({
      name: '见外传媒知识库',
      shortName: 'SEEWAY',
      standardName: 'SEEWAY 见外',
      assistantName: '我是见外传媒知识库',
    })
  })

  it('品牌资源存在且非空', () => {
    for (const src of [BRAND_CONFIG.markSrc, BRAND_CONFIG.shortWordmarkSrc, BRAND_CONFIG.wordmarkSrc]) {
      const assetPath = resolve(process.cwd(), 'public', src.replace(/^\/brand\//, 'brand/'))
      expect(existsSync(assetPath), src).toBe(true)
      expect(statSync(assetPath).size, src).toBeGreaterThan(0)
    }
  })

  it('主要用户界面不残留旧品牌名', () => {
    for (const relativePath of USER_VISIBLE_SOURCES) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8')
      const withoutUrls = source.replaceAll(/https?:\/\/[^'"\s]+/g, '')
      expect(withoutUrls, relativePath).not.toMatch(/MimirQ|SeeWayK/)
    }
  })
})
