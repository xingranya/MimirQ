import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const panelSource = readFileSync(
  resolve(__dirname, 'data-governance-panel.tsx'),
  'utf8'
)

describe('数据治理正文安全门禁', () => {
  it('读取知识库正文时记录两种截断标记', () => {
    expect(panelSource).toContain('remote.markdown_truncated')
    expect(panelSource).toContain('remote.original_markdown_truncated')
    expect(panelSource).toContain('GOVERNANCE_CONTENT_READ_LIMIT')
    expect(panelSource).toContain('updateContentTruncationState(id, contentTruncated)')
  })

  it('截断正文不能保存或提交切块', () => {
    expect(panelSource).toContain('throw new GovernanceContentIncompleteError()')
    expect(panelSource).toContain('selectedContentIsTruncated')
    expect(panelSource).toContain('selectedReadyContainsTruncatedContent')
    expect(panelSource).toContain("t('toasts.truncatedContentReadOnly')")
  })
})
