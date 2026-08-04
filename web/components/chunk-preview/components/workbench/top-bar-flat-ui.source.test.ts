import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const topBarSource = readFileSync(resolve(__dirname, 'top-bar.tsx'), 'utf8')
const catalogSource = readFileSync(
  resolve(__dirname, '../../../../i18n/messages/zh-CN/chunk-preview.ts'),
  'utf8'
)

describe('分块预览顶部栏', () => {
  it('以内联方式展示文件信息和可读名称', () => {
    expect(topBarSource).toContain("{t('topBar.fileMeta.index')} {currentFileIndex + 1}")
    expect(topBarSource).toContain('getParserLabel(effectiveParserBackend)')
    expect(topBarSource).toContain("visibleChunkUnit === 'tokens' ? '词元' : '字符'")
    expect(topBarSource).not.toContain('absolute -bottom-')
  })

  it('小屏隐藏次要按钮文字并保留可访问名称', () => {
    expect(topBarSource).toContain('hidden sm:inline')
    expect(topBarSource).toContain('hidden md:inline')
    expect(topBarSource).toContain("aria-label={t('topBar.actions.reset')}")
    expect(topBarSource).toContain("aria-label={t('topBar.actions.openSettingsPanel')}")
    expect(topBarSource).toContain("aria-label={t('topBar.actions.moreActions')}")
  })

  it('保留重置、参数、原文、帮助、更多操作和入库链路', () => {
    for (const handler of [
      'onClick={reset}',
      'onClick={toggleSettingsPanel}',
      'onClick={toggleOriginalPanel}',
      'onClick={() => setHelpOpen(true)}',
      'onClick={submitChunks}',
      'onClick={onClose}',
      'onSelect={() => setCompareOpen(true)}',
      'onSelect={() => importConfigInputRef.current?.click()}',
    ]) {
      expect(topBarSource).toContain(handler)
    }
    expect(topBarSource).toContain('max-h-[min(70vh,32rem)]')
    expect(topBarSource).toContain('overflow-y-auto')
  })

  it('移除旧式装饰和小字号', () => {
    for (const forbidden of [
      'bg-[linear-gradient',
      'bg-[radial-gradient',
      'backdrop-blur',
      'shadow-[',
      'shadow-lg',
      'rounded-xl',
      'rounded-2xl',
      'rounded-3xl',
      'font-black',
      'uppercase',
      'tracking-[',
    ]) {
      expect(topBarSource).not.toContain(forbidden)
    }
    expect(topBarSource).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.[0-9]+)?px\]/)
  })

  it('中文文案不暴露内部状态字段和开发术语', () => {
    expect(catalogSource).toContain("autoSelectedStrategyTitle: '自动选择的策略：{strategy}'")
    expect(catalogSource).toContain("parseCacheAgeTitle: '缓存时间：{age} 毫秒'")
    expect(catalogSource).toContain("copyIngestPayload: '复制手动入库数据'")
    expect(catalogSource).toContain("copyCurl: '复制接口请求'")

    for (const oldCopy of [
      "autoSelectedStrategyTitle: 'auto_selected_strategy: {strategy}'",
      "parseCacheAgeTitle: 'parse_cache_age_ms: {age}'",
      "includeSkippedInExports: '导出时包含 SKIP chunks ({count})'",
      "copiedIngestPayload: '已复制手动入库 payload'",
    ]) {
      expect(catalogSource).not.toContain(oldCopy)
    }
  })
})
