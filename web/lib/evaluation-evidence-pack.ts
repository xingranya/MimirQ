export type EvidencePackDatasetResolution =
  | { ok: true; datasetId: string }
  | {
      ok: false
      reason: 'missing_active_dataset' | 'dataset_mismatch'
    }

/** 确保证据包只写入用户当前正在操作的数据集。 */
export function resolveEvidencePackDataset(
  activeDatasetId: string | null | undefined,
  packDatasetId: string | null | undefined
): EvidencePackDatasetResolution {
  const activeId = String(activeDatasetId || '').trim()
  const packId = String(packDatasetId || '').trim()

  if (!activeId) {
    return { ok: false, reason: 'missing_active_dataset' }
  }
  if (packId && packId !== activeId) {
    return { ok: false, reason: 'dataset_mismatch' }
  }
  return { ok: true, datasetId: activeId }
}
