type ParsingWorkspaceDatasetFallback = {
  datasetId?: string | null
  datasetName?: string | null
}

type ParsingWorkspaceDataset = {
  datasetId: string | null
  datasetName: string | null
}

function readMetadataString(metadata: unknown, key: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return ''
  }

  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 解析工作区文档实际存放在专用数据集中，业务目标数据集记录在文档元数据中。
 */
export function resolveParsingWorkspaceDataset(
  metadata: unknown,
  datasetNameById: ReadonlyMap<string, string>,
  fallback: ParsingWorkspaceDatasetFallback = {}
): ParsingWorkspaceDataset {
  const datasetId =
    readMetadataString(metadata, 'target_dataset_id') ||
    fallback.datasetId ||
    null
  const datasetName =
    readMetadataString(metadata, 'target_dataset_name') ||
    (datasetId
      ? datasetNameById.get(datasetId) || fallback.datasetName || datasetId
      : fallback.datasetName || null)

  return { datasetId, datasetName }
}
