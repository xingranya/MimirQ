import { describe, expect, it, vi } from 'vitest'

import { saveGovernanceFileToBackend } from './governance-file-save'

const payload = {
  markdown_content: '治理后的内容',
  original_markdown_content: '原始内容',
}

function createDependencies() {
  return {
    updateKnowledgeDocument: vi.fn(async () => undefined),
    updateParsingDocument: vi.fn(async () => undefined),
  }
}

describe('saveGovernanceFileToBackend', () => {
  it('知识库文档写回知识库内容接口', async () => {
    const dependencies = createDependencies()

    await saveGovernanceFileToBackend(
      'knowledge-document',
      'knowledge_base',
      payload,
      dependencies
    )

    expect(dependencies.updateKnowledgeDocument).toHaveBeenCalledWith(
      'knowledge-document',
      payload
    )
    expect(dependencies.updateParsingDocument).not.toHaveBeenCalled()
  })

  it('解析工作区文档写回解析内容接口', async () => {
    const dependencies = createDependencies()

    await saveGovernanceFileToBackend(
      'parsing-document',
      'parsing_workspace',
      payload,
      dependencies
    )

    expect(dependencies.updateParsingDocument).toHaveBeenCalledWith(
      'parsing-document',
      payload
    )
    expect(dependencies.updateKnowledgeDocument).not.toHaveBeenCalled()
  })

  it('本地草稿不调用远端接口', async () => {
    const dependencies = createDependencies()

    await saveGovernanceFileToBackend(
      'local-document',
      undefined,
      payload,
      dependencies
    )

    expect(dependencies.updateKnowledgeDocument).not.toHaveBeenCalled()
    expect(dependencies.updateParsingDocument).not.toHaveBeenCalled()
  })

  it('将远端保存错误交给调用方处理', async () => {
    const dependencies = createDependencies()
    dependencies.updateParsingDocument.mockRejectedValueOnce(
      new Error('save failed')
    )

    await expect(
      saveGovernanceFileToBackend(
        'parsing-document',
        'parsing_workspace',
        payload,
        dependencies
      )
    ).rejects.toThrow('save failed')
  })
})
