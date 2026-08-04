import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const knowledgePageSource = readFileSync(resolve(__dirname, 'knowledge-page.tsx'), 'utf8')
const documentsPanelSource = readFileSync(
  resolve(__dirname, 'knowledge-documents-panel.tsx'),
  'utf8'
)
const operationsPanelSource = readFileSync(
  resolve(__dirname, '../documents/document-operations-panel.tsx'),
  'utf8'
)
const profilePageSource = readFileSync(
  resolve(__dirname, '../../app/datasets/[id]/profile/page-client.tsx'),
  'utf8'
)

describe('知识库批量文档操作契约', () => {
  it('按后端实际结果区分成功、部分成功和全部失败', () => {
    expect(knowledgePageSource).toContain('createDocumentBatchOutcome(')
    expect(knowledgePageSource).toContain("result,\n          'updated'")
    expect(knowledgePageSource).toContain("result,\n        'queued'")
    expect(knowledgePageSource).toContain("result,\n        'deleted'")
    expect(knowledgePageSource).not.toContain('batchLifecycleSuccess')
    expect(knowledgePageSource).not.toContain('batchReingestSuccess')
    expect(profilePageSource).toContain(
      "createDocumentBatchOutcome(docIds, result, 'queued')"
    )
  })

  it('只移除明确成功的选择，并在变更后刷新文档列表', () => {
    expect(knowledgePageSource).toContain(
      'setSelectedDocIds(outcome.remainingIds)'
    )
    expect(documentsPanelSource).toContain(
      'onSelectedDocumentIdsChange={setSelectedDocIds}'
    )
    expect(documentsPanelSource).toContain(
      'onDocumentsChanged={onDocumentsChanged}'
    )
    expect(operationsPanelSource).toContain(
      'onSelectedDocumentIdsChange?.(outcome.remainingIds)'
    )
    expect(operationsPanelSource).toContain(
      'if (outcome.succeeded > 0) await onDocumentsChanged?.()'
    )
  })

  it('运维面板使用扁平视觉和可读字号', () => {
    expect(operationsPanelSource).not.toContain('linear-gradient')
    expect(operationsPanelSource).not.toContain('backdrop-blur')
    expect(operationsPanelSource).not.toContain('rounded-[')
    expect(operationsPanelSource).not.toContain('rounded-xl')
    expect(operationsPanelSource).not.toContain('rounded-2xl')
    expect(operationsPanelSource).not.toContain('shadow-[')
    expect(operationsPanelSource).not.toContain('text-[10px]')
    expect(operationsPanelSource).not.toContain('text-[11px]')
  })
})
