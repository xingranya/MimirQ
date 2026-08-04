import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const knowledgePageSource = readFileSync(
  resolve(__dirname, 'knowledge/knowledge-page.tsx'),
  'utf8'
)
const dropZoneSource = readFileSync(
  resolve(__dirname, 'ingestion/drop-zone.tsx'),
  'utf8'
)
const operationPageSource = readFileSync(
  resolve(__dirname, '../app/knowledge/ingestion/operation-page-client.tsx'),
  'utf8'
)
const sidebarSource = readFileSync(resolve(__dirname, 'sidebar.tsx'), 'utf8')
const uploadHookSource = readFileSync(
  resolve(__dirname, '../hooks/use-document-upload.ts'),
  'utf8'
)

describe('文档上传入口结果契约', () => {
  it('所有上传入口复用统一结果判定', () => {
    for (const source of [
      knowledgePageSource,
      dropZoneSource,
      operationPageSource,
      sidebarSource,
    ]) {
      expect(source).toContain('createDocumentUploadOutcome(')
      expect(source).toContain('formatDocumentUploadOutcome(')
    }
  })

  it('知识库和侧栏不会把全部失败提示为成功', () => {
    expect(knowledgePageSource).toContain("if (outcome.status === 'error')")
    expect(knowledgePageSource).toContain("if (outcome.status === 'warning') toast.warning(message)")
    expect(sidebarSource).toContain("if (outcome.status === 'error') toast.error(message)")
    expect(sidebarSource).toContain("else if (outcome.status === 'warning') toast.warning(message)")
  })

  it('拖放上传只在实际成功后触发完成回调', () => {
    expect(dropZoneSource).toContain('if (outcome.succeeded > 0) onUploadComplete()')
    expect(dropZoneSource).toContain('return outcome.succeeded > 0')
    expect(dropZoneSource).toContain('if (!succeeded) return')
  })

  it('批量上传全部失败时不刷新文档列表', () => {
    expect(uploadHookSource).toContain(
      'if (successes.length > 0) await loadDocuments()'
    )
  })

  it('入库页保留部分成功状态和失败明细', () => {
    expect(operationPageSource).toContain("? 'partial'")
    expect(operationPageSource).toContain("if (status === 'partial') return '部分完成'")
    expect(operationPageSource).toContain('<UploadResultNotice response={uploadResponse} />')
    expect(operationPageSource).toContain('failure.error || \'未返回失败原因\'')
    expect(operationPageSource).toContain("if (outcome.status === 'error') toast.error(message)")
    expect(operationPageSource).toContain("else if (outcome.status === 'warning') toast.warning(message)")
  })
})
