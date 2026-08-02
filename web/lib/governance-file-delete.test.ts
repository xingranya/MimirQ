import { describe, expect, it, vi } from 'vitest'

import { deleteGovernanceFileFromBackend } from './governance-file-delete'

function createDependencies() {
  return {
    deleteKnowledgeDocument: vi.fn(async () => undefined),
    deleteParsingDocument: vi.fn(async () => undefined),
  }
}

describe('deleteGovernanceFileFromBackend', () => {
  it('知识库文档调用知识库删除接口', async () => {
    const dependencies = createDependencies()

    await deleteGovernanceFileFromBackend(
      'knowledge-document',
      'knowledge_base',
      dependencies
    )

    expect(dependencies.deleteKnowledgeDocument).toHaveBeenCalledWith(
      'knowledge-document'
    )
    expect(dependencies.deleteParsingDocument).not.toHaveBeenCalled()
  })

  it('解析工作区文档调用解析删除接口', async () => {
    const dependencies = createDependencies()

    await deleteGovernanceFileFromBackend(
      'parsing-document',
      'parsing_workspace',
      dependencies
    )

    expect(dependencies.deleteParsingDocument).toHaveBeenCalledWith(
      'parsing-document'
    )
    expect(dependencies.deleteKnowledgeDocument).not.toHaveBeenCalled()
  })

  it('本地草稿不调用远端接口', async () => {
    const dependencies = createDependencies()

    await deleteGovernanceFileFromBackend(
      'local-document',
      undefined,
      dependencies
    )

    expect(dependencies.deleteKnowledgeDocument).not.toHaveBeenCalled()
    expect(dependencies.deleteParsingDocument).not.toHaveBeenCalled()
  })

  it('将远端删除错误交给调用方处理', async () => {
    const dependencies = createDependencies()
    dependencies.deleteKnowledgeDocument.mockRejectedValueOnce(
      new Error('delete failed')
    )

    await expect(
      deleteGovernanceFileFromBackend(
        'knowledge-document',
        'knowledge_base',
        dependencies
      )
    ).rejects.toThrow('delete failed')
  })
})
