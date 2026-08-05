import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'quality-checker.tsx'), 'utf8')
const messages = readFileSync(
  resolve(__dirname, '../../i18n/messages/zh-CN/governance.ts'),
  'utf8'
)

describe('质量检查面板视觉与行为契约', () => {
  it('使用扁平表面、统一圆角和单一分数摘要', () => {
    expect(source).not.toMatch(/rounded-(?:xl|2xl|3xl)|shadow-\[|backdrop-blur/)
    expect(source).toContain("'rounded-lg border p-4'")
    expect(source).toContain('hasScanResult &&')
    expect(source.match(/\{score\}/g)).toHaveLength(1)
  })

  it('深度检测使用开关，扫描操作在窄屏保持可达', () => {
    expect(source).toContain('<Switch')
    expect(source).toContain('onCheckedChange={setBackendScanEnabled}')
    expect(source).toContain('flex flex-col gap-3 sm:flex-row')
    expect(source).toContain('disabled={isScanning || !content.trim()}')
    expect(source).toContain('aria-expanded={isExpanded}')
    expect(source).toContain('aria-controls={detailId}')
  })

  it('阻止重复自动扫描和过期结果覆盖新文档', () => {
    expect(source).toContain('lastAutoScannedContentRef.current === content')
    expect(source).toContain('requestId !== scanRequestIdRef.current')
    expect(messages).toContain('深度检测暂时不可用，已保留本地检查结果')
    expect(messages).not.toContain("failed: '后端检测失败（可忽略）'")
  })
})
