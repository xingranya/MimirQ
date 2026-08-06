import { documentApi } from '@/lib/api/documents'
import { formatApiError } from '@/lib/api-errors'
import type {
  DocumentBatchUploadFailure,
  DocumentBatchUploadResponse,
  DocumentBatchUploadSuccess,
} from '@/types'

export const DOCUMENT_UPLOAD_REQUEST_BATCH_SIZE = 5

export type DocumentUploadBatchRequestOptions = NonNullable<
  Parameters<typeof documentApi.uploadBatch>[1]
>

type UploadFile = File & { webkitRelativePath?: string }

function fileKey(file: File): string {
  return String((file as UploadFile).webkitRelativePath || file.name || '').trim()
}

function resultKey(result: DocumentBatchUploadFailure | DocumentBatchUploadSuccess): string {
  return String(result.source_path || result.filename || '').trim()
}

function resultCount(value: unknown): number {
  const count = Number(value)
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.floor(count)
}

function optionsForBatch(
  options: DocumentUploadBatchRequestOptions,
  batch: File[]
): DocumentUploadBatchRequestOptions {
  if (!options.user_metadata_map) return options

  const userMetadataMap = Object.fromEntries(
    batch.flatMap((file) => {
      const key = fileKey(file)
      const metadata = options.user_metadata_map?.[key]
      return metadata ? [[key, metadata] as const] : []
    })
  )
  return {
    ...options,
    user_metadata_map: userMetadataMap,
  }
}

/** 将文件拆成小批次顺序提交，并保留每个已完成批次的真实结果。 */
export async function uploadDocumentFilesInBatches(
  files: File[],
  options: DocumentUploadBatchRequestOptions = {},
  batchSize = DOCUMENT_UPLOAD_REQUEST_BATCH_SIZE
): Promise<DocumentBatchUploadResponse> {
  const validFiles = files.filter(Boolean)
  const successful: DocumentBatchUploadSuccess[] = []
  const failed: DocumentBatchUploadFailure[] = []
  const precheckScanRunIds: string[] = []
  let precheckScanRunId: string | null | undefined
  let precheckSuccessfulCount = 0
  let precheckFailedCount = 0
  const isPrecheckOnly = options.precheck_only === true
  const requestedBatchSize = Number.isFinite(batchSize)
    ? Math.floor(batchSize)
    : DOCUMENT_UPLOAD_REQUEST_BATCH_SIZE
  const safeBatchSize = Math.max(
    1,
    Math.min(DOCUMENT_UPLOAD_REQUEST_BATCH_SIZE, requestedBatchSize)
  )

  for (let offset = 0; offset < validFiles.length; offset += safeBatchSize) {
    const batch = validFiles.slice(offset, offset + safeBatchSize)
    try {
      const response = await documentApi.uploadBatch(batch, optionsForBatch(options, batch))
      const batchSuccessful = Array.isArray(response.successful) ? response.successful : []
      const batchFailed = Array.isArray(response.failed) ? response.failed : []
      successful.push(...batchSuccessful)
      failed.push(...batchFailed)
      precheckScanRunId = response.precheck_scan_run_id || precheckScanRunId

      const responseScanRunIds = Array.isArray(response.precheck_scan_run_ids)
        ? response.precheck_scan_run_ids
        : []
      for (const scanRunId of [response.precheck_scan_run_id, ...responseScanRunIds]) {
        const normalizedScanRunId = String(scanRunId || '').trim()
        if (normalizedScanRunId && !precheckScanRunIds.includes(normalizedScanRunId)) {
          precheckScanRunIds.push(normalizedScanRunId)
        }
      }

      if (isPrecheckOnly) {
        precheckSuccessfulCount += resultCount(response.successful_count)
        precheckFailedCount += Math.max(
          resultCount(response.failed_count),
          batchFailed.length
        )
        continue
      }

      const returnedKeys = new Set(
        [...batchSuccessful, ...batchFailed].map(resultKey).filter(Boolean)
      )
      for (const file of batch) {
        const key = fileKey(file)
        if (returnedKeys.has(key) || returnedKeys.has(file.name)) continue
        failed.push({
          filename: file.name,
          source_path: key && key !== file.name ? key : null,
          error: '服务器未返回该文件的处理结果',
        })
      }
    } catch (error) {
      const reason = formatApiError(error, '上传请求失败')
      if (isPrecheckOnly) precheckFailedCount += batch.length
      failed.push(
        ...batch.map((file) => {
          const key = fileKey(file)
          return {
            filename: file.name,
            source_path: key && key !== file.name ? key : null,
            error: reason,
          }
        })
      )
    }
  }

  return {
    total: validFiles.length,
    successful_count: isPrecheckOnly ? precheckSuccessfulCount : successful.length,
    failed_count: isPrecheckOnly ? precheckFailedCount : failed.length,
    successful,
    failed,
    precheck_scan_run_id: precheckScanRunId || null,
    precheck_scan_run_ids: precheckScanRunIds,
  }
}
