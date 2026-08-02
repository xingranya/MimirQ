export type GovernanceFileSource =
  | 'knowledge_base'
  | 'parsing_workspace'
  | undefined

type GovernanceFileDeleteDependencies = {
  deleteKnowledgeDocument: (documentId: string) => Promise<void>
  deleteParsingDocument: (documentId: string) => Promise<void>
}

/**
 * 根据治理文件的真实来源删除远端文档；没有远端来源的草稿只需由调用方清理本地状态。
 */
export async function deleteGovernanceFileFromBackend(
  documentId: string,
  source: GovernanceFileSource,
  dependencies: GovernanceFileDeleteDependencies
): Promise<void> {
  if (source === 'knowledge_base') {
    await dependencies.deleteKnowledgeDocument(documentId)
    return
  }

  if (source === 'parsing_workspace') {
    await dependencies.deleteParsingDocument(documentId)
  }
}
