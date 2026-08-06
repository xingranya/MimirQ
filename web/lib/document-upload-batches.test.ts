import { afterEach, describe, expect, it, vi } from 'vitest'

import { documentApi } from '@/lib/api/documents'
import { uploadDocumentFilesInBatches } from '@/lib/document-upload-batches'

function files(count: number): File[] {
  return Array.from(
    { length: count },
    (_value, index) =>
      new File([`content-${index}`], `document-${index}.txt`, { type: 'text/plain' })
  )
}

describe('文档小批量上传', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('每批最多提交五个文件并汇总结果', async () => {
    const upload = vi.spyOn(documentApi, 'uploadBatch').mockImplementation(async (batch) => ({
      total: batch.length,
      successful_count: batch.length,
      failed_count: 0,
      successful: batch.map((file, index) => ({
        document_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        filename: file.name,
        status: 'pending',
      })),
      failed: [],
      precheck_scan_run_id: null,
    }))

    const response = await uploadDocumentFilesInBatches(files(12), {})

    expect(upload.mock.calls.map(([batch]) => batch.length)).toEqual([5, 5, 2])
    expect(response).toMatchObject({
      total: 12,
      successful_count: 12,
      failed_count: 0,
    })
  })

  it('单批请求失败时保留前后批次成功结果且不重复提交', async () => {
    const input = files(12)
    const submitted: string[][] = []
    vi.spyOn(documentApi, 'uploadBatch').mockImplementation(async (batch) => {
      submitted.push(batch.map((file) => file.name))
      if (submitted.length === 2) throw new Error('网关超时')
      return {
        total: batch.length,
        successful_count: batch.length,
        failed_count: 0,
        successful: batch.map((file, index) => ({
          document_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          filename: file.name,
          status: 'pending',
        })),
        failed: [],
        precheck_scan_run_id: null,
      }
    })

    const response = await uploadDocumentFilesInBatches(input, {})

    expect(submitted).toEqual([
      input.slice(0, 5).map((file) => file.name),
      input.slice(5, 10).map((file) => file.name),
      input.slice(10).map((file) => file.name),
    ])
    expect(response.successful_count).toBe(7)
    expect(response.failed_count).toBe(5)
    const failed = response.failed || []
    expect(failed.map((item) => item.filename)).toEqual(input.slice(5, 10).map((file) => file.name))
    expect(failed.every((item) => item.error.includes('网关超时'))).toBe(true)
  })

  it('每批只携带该批文件的用户元数据', async () => {
    const input = files(6)
    const metadataKeys: string[][] = []
    vi.spyOn(documentApi, 'uploadBatch').mockImplementation(async (batch, options) => {
      metadataKeys.push(Object.keys(options?.user_metadata_map || {}))
      return {
        total: batch.length,
        successful_count: 0,
        failed_count: batch.length,
        successful: [],
        failed: batch.map((file) => ({ filename: file.name, error: '测试失败' })),
        precheck_scan_run_id: null,
      }
    })

    await uploadDocumentFilesInBatches(input, {
      user_metadata_map: Object.fromEntries(
        input.map((file) => [file.name, { source: file.name }])
      ),
    })

    expect(metadataKeys).toEqual([input.slice(0, 5).map((file) => file.name), [input[5].name]])
  })
})
