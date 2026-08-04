import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, '_sections/parser-services-section.tsx'),
  'utf8'
)

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

  it('使用扁平容器和标准字号', () => {
    expect(source).toContain('rounded-lg border border-border bg-background p-4')
    expect(source).not.toContain('rounded-[')
    expect(source).not.toContain('shadow-')
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
  })
})
