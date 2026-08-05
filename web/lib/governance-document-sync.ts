import type { ParsedFileData } from '@/store/use-parsed-files-store'

export type GovernanceRemoteSource = Exclude<ParsedFileData['source'], undefined>

export type GovernanceDocumentSourceFailure = {
  source: GovernanceRemoteSource
  reason: unknown
}

export type GovernanceDocumentSourceResult<TParsing, TKnowledge> = {
  parsingItems: TParsing[]
  knowledgeItems: TKnowledge[]
  syncedSources: GovernanceRemoteSource[]
  failedSources: GovernanceRemoteSource[]
  failures: GovernanceDocumentSourceFailure[]
}

/** 两个治理文档来源均不可用时抛出，调用方不得把失败误判为空列表。 */
export class GovernanceDocumentSyncUnavailableError extends Error {
  readonly failures: GovernanceDocumentSourceFailure[]

  constructor(failures: GovernanceDocumentSourceFailure[]) {
    super('All governance document sources are unavailable')
    this.name = 'GovernanceDocumentSyncUnavailableError'
    this.failures = failures
  }
}

type GovernanceDocumentPage<T> = {
  total: number
  items: T[]
}

type ReconcileGovernanceFilesOptions = {
  currentFiles: ParsedFileData[]
  remoteFiles: ParsedFileData[]
  syncedSources: ReadonlySet<GovernanceRemoteSource>
  datasetId: string | null
}

const GOVERNANCE_DOCUMENT_PAGE_SIZE = 200

/**
 * 并行读取解析工作区和知识库。单源失败时保留成功结果，双源失败时明确中止同步。
 */
export async function settleGovernanceDocumentSources<TParsing, TKnowledge>(
  parsingRequest: Promise<TParsing[]>,
  knowledgeRequest: Promise<TKnowledge[]>
): Promise<GovernanceDocumentSourceResult<TParsing, TKnowledge>> {
  const [parsingResult, knowledgeResult] = await Promise.allSettled([
    parsingRequest,
    knowledgeRequest,
  ])
  const failures: GovernanceDocumentSourceFailure[] = []

  if (parsingResult.status === 'rejected') {
    failures.push({
      source: 'parsing_workspace',
      reason: parsingResult.reason,
    })
  }
  if (knowledgeResult.status === 'rejected') {
    failures.push({
      source: 'knowledge_base',
      reason: knowledgeResult.reason,
    })
  }
  if (failures.length === 2) {
    throw new GovernanceDocumentSyncUnavailableError(failures)
  }

  const syncedSources: GovernanceRemoteSource[] = []
  if (parsingResult.status === 'fulfilled') {
    syncedSources.push('parsing_workspace')
  }
  if (knowledgeResult.status === 'fulfilled') {
    syncedSources.push('knowledge_base')
  }

  return {
    parsingItems: parsingResult.status === 'fulfilled' ? parsingResult.value : [],
    knowledgeItems: knowledgeResult.status === 'fulfilled' ? knowledgeResult.value : [],
    syncedSources,
    failedSources: failures.map((failure) => failure.source),
    failures,
  }
}

/** 按后端总数连续读取治理文档，避免只展示首个 200 条结果。 */
export async function fetchAllGovernanceDocuments<T>(
  fetchPage: (params: { skip: number; limit: number }) => Promise<GovernanceDocumentPage<T>>
): Promise<T[]> {
  const items: T[] = []
  let skip = 0

  while (true) {
    const page = await fetchPage({
      skip,
      limit: GOVERNANCE_DOCUMENT_PAGE_SIZE,
    })
    const pageItems = page.items || []
    items.push(...pageItems)

    if (pageItems.length === 0 || items.length >= Math.max(0, Number(page.total || 0))) {
      return items
    }

    skip += pageItems.length
  }
}

function isFileInDatasetScope(file: ParsedFileData, datasetId: string | null): boolean {
  return !datasetId || file.datasetId === datasetId
}

/**
 * 合并远端权威列表与本地治理草稿，并只清理已完整同步来源中的失效记录。
 */
export function reconcileGovernanceFiles({
  currentFiles,
  remoteFiles,
  syncedSources,
  datasetId,
}: ReconcileGovernanceFilesOptions): ParsedFileData[] {
  const remoteById = new Map(remoteFiles.map((file) => [file.id, file]))
  const reconciled: ParsedFileData[] = []

  for (const file of currentFiles) {
    const remote = remoteById.get(file.id)
    if (remote) {
      remoteById.delete(file.id)
      reconciled.push({
        ...remote,
        markdownContent: file.markdownContent || remote.markdownContent,
        originalMarkdownContent: file.originalMarkdownContent || remote.originalMarkdownContent,
        folderId: file.folderId || remote.folderId,
        governanceStatus: file.governanceStatus || remote.governanceStatus,
        chunkStatus: file.chunkStatus || remote.chunkStatus,
      })
      continue
    }

    const shouldRemoveStaleRemoteFile =
      file.source && syncedSources.has(file.source) && isFileInDatasetScope(file, datasetId)
    if (!shouldRemoveStaleRemoteFile) {
      reconciled.push(file)
    }
  }

  return [...reconciled, ...remoteById.values()]
}
