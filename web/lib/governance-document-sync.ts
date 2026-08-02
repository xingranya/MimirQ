import type { ParsedFileData } from '@/store/use-parsed-files-store'

export type GovernanceRemoteSource = Exclude<
  ParsedFileData['source'],
  undefined
>

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

/** 按后端总数连续读取治理文档，避免只展示首个 200 条结果。 */
export async function fetchAllGovernanceDocuments<T>(
  fetchPage: (params: {
    skip: number
    limit: number
  }) => Promise<GovernanceDocumentPage<T>>
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

    if (
      pageItems.length === 0 ||
      items.length >= Math.max(0, Number(page.total || 0))
    ) {
      return items
    }

    skip += pageItems.length
  }
}

function isFileInDatasetScope(
  file: ParsedFileData,
  datasetId: string | null
): boolean {
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
        originalMarkdownContent:
          file.originalMarkdownContent || remote.originalMarkdownContent,
        folderId: file.folderId || remote.folderId,
        governanceStatus: file.governanceStatus || remote.governanceStatus,
        chunkStatus: file.chunkStatus || remote.chunkStatus,
      })
      continue
    }

    const shouldRemoveStaleRemoteFile =
      file.source &&
      syncedSources.has(file.source) &&
      isFileInDatasetScope(file, datasetId)
    if (!shouldRemoveStaleRemoteFile) {
      reconciled.push(file)
    }
  }

  return [...reconciled, ...remoteById.values()]
}
