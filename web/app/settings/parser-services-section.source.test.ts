import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, '_sections/parser-services-section.tsx'), 'utf8')

describe('解析服务设置', () => {
  it('保留六种解析器的配置回调', () => {
    for (const callback of [
      'updateMinerU',
      'updateEtl4Llm',
      'updateMarker',
      'updatePaddleVL',
      'updateTextIn',
      'updateMagicPDF',
    ]) {
      expect(source).toContain(callback)
    }
  })

  it('保留本地 MinerU、在线接口和 MagicPDF 运行配置', () => {
    expect(source).toContain('mineru.local_server_url')
    expect(source).toContain('mineru.api_token')
    expect(source).toContain('magicPdf.models_dir')
    expect(source).toContain('magicPdf.device_mode')
    expect(source).toContain('magicPdf.keep_artifacts')
  })

  it('每个服务使用独立折叠任务行，并合并启用和运行状态', () => {
    expect(source.match(/<ParserServicePanel/g)).toHaveLength(6)
    expect(source).toContain('data-parser-service={id}')
    expect(source).toContain('onCheckedChange={onToggleEnabled}')
    expect(source).toContain('parserStatusLabel')
    expect(source).toContain('settingsWritable={settingsWritable}')
    expect(source).toContain('parserSearchMatches(searchQuery')
    expect(source).not.toContain('SECTION_TITLE')
  })

  it('使用线性分隔和标准字号', () => {
    expect(source).toContain('border-y border-border')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('shadow-')
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })
})
