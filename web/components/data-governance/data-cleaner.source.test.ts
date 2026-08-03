import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const cleanerSource = readFileSync(resolve(__dirname, 'data-cleaner.tsx'), 'utf8')

describe('数据清洗器', () => {
  it('保留规则清洗和模型二次清洗链路', () => {
    expect(cleanerSource).toContain('pipelineApi.cleanPreview(request)')
    expect(cleanerSource).toContain('pipelineApi.llmCleanPreview(llmRequest)')
    expect(cleanerSource).toContain('onClean(next)')
    expect(cleanerSource).toContain('<GovernanceProfileSelector')
    expect(cleanerSource).toContain('<PipelineOptionsPanel')
  })

  it('使用扁平视觉和可读字号', () => {
    expect(cleanerSource).not.toMatch(/linear-gradient|backdrop-blur|shadow-\[/)
    expect(cleanerSource).not.toMatch(/rounded-\[|rounded-(?:xl|2xl|3xl|full)/)
    expect(cleanerSource).not.toMatch(/text-\[(?:9|10|11)(?:\.5)?px\]/)
    expect(cleanerSource).toContain('bg-primary px-3.5 text-xs')
  })
})
