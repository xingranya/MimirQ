import type { GovernanceFileSource } from './governance-file-delete'

export type GovernanceContentUpdate = {
  markdown_content: string
  original_markdown_content?: string | null
}

type GovernanceFileSaveDependencies = {
  updateKnowledgeDocument: (
    documentId: string,
    payload: GovernanceContentUpdate
  ) => Promise<unknown>
  updateParsingDocument: (
    documentId: string,
    payload: GovernanceContentUpdate
  ) => Promise<unknown>
}

/**
 * 将治理内容写回对应远端文档；本地草稿由调用方继续保存在浏览器缓存中。
 */
export async function saveGovernanceFileToBackend(
  documentId: string,
  source: GovernanceFileSource,
  payload: GovernanceContentUpdate,
  dependencies: GovernanceFileSaveDependencies
): Promise<void> {
  if (source === 'knowledge_base') {
    await dependencies.updateKnowledgeDocument(documentId, payload)
    return
  }

  if (source === 'parsing_workspace') {
    await dependencies.updateParsingDocument(documentId, payload)
  }
}
