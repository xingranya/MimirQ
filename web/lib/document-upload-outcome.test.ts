import { describe, expect, it } from 'vitest'

import {
  createDocumentUploadOutcome,
  formatDocumentUploadOutcome,
} from './document-upload-outcome'

describe('文档上传结果', () => {
  it('全部成功时显示成功数量', () => {
    const outcome = createDocumentUploadOutcome({
      total: 2,
      successful_count: 2,
      failed_count: 0,
      successful: [],
      failed: [],
    })

    expect(outcome.status).toBe('success')
    expect(
      formatDocumentUploadOutcome(outcome, {
        successVerb: '已上传',
        completeFailure: '文件上传失败',
      })
    ).toBe('已上传 2 个文件')
  })

  it('部分成功时显示失败文件和原因', () => {
    const outcome = createDocumentUploadOutcome({
      total: 3,
      successful_count: 2,
      failed_count: 1,
      successful: [],
      failed: [{ filename: '合同.pdf', error: '文件已存在' }],
    })

    expect(outcome.status).toBe('warning')
    expect(
      formatDocumentUploadOutcome(outcome, {
        successVerb: '已提交',
        completeFailure: '入库任务提交失败',
      })
    ).toBe('已提交 2 个文件，1 个失败：合同.pdf（文件已存在）')
  })

  it('全部失败时不会生成成功文案', () => {
    const outcome = createDocumentUploadOutcome({
      total: 2,
      successful_count: 0,
      failed_count: 2,
      successful: [],
      failed: [
        { filename: 'a.exe', error: '不支持该文件格式' },
        { filename: 'b.pdf', error: '文件损坏' },
      ],
    })

    expect(outcome.status).toBe('error')
    expect(
      formatDocumentUploadOutcome(outcome, {
        successVerb: '已上传',
        completeFailure: '文件上传失败',
      })
    ).toBe('文件上传失败，2 个文件未处理：a.exe（不支持该文件格式）；b.pdf（文件损坏）')
  })

  it('失败明细限制为三条并报告剩余数量', () => {
    const outcome = createDocumentUploadOutcome({
      total: 5,
      successful_count: 1,
      failed_count: 4,
      successful: [],
      failed: [
        { filename: '1.pdf', error: '失败 1' },
        { filename: '2.pdf', error: '失败 2' },
        { filename: '3.pdf', error: '失败 3' },
        { filename: '4.pdf', error: '失败 4' },
      ],
    })
    const message = formatDocumentUploadOutcome(outcome, {
      successVerb: '已上传',
      completeFailure: '文件上传失败',
    })

    expect(message).toContain('1.pdf（失败 1）')
    expect(message).toContain('3.pdf（失败 3）')
    expect(message).not.toContain('4.pdf（失败 4）')
    expect(message).toContain('另有 1 个文件失败')
  })

  it('空请求返回可操作的失败提示', () => {
    const outcome = createDocumentUploadOutcome({
      total: 0,
      successful_count: 0,
      failed_count: 0,
      successful: [],
      failed: [],
    })

    expect(outcome.status).toBe('error')
    expect(
      formatDocumentUploadOutcome(outcome, {
        successVerb: '已上传',
        completeFailure: '文件上传失败',
      })
    ).toBe('没有可处理的文件')
  })

  it('异常计数不会生成负数或小数', () => {
    const outcome = createDocumentUploadOutcome({
      total: -1,
      successful_count: 1.8,
      failed_count: Number.NaN,
      successful: [],
      failed: [],
    })

    expect(outcome).toMatchObject({
      status: 'success',
      total: 1,
      succeeded: 1,
      failed: 0,
    })
  })

  it('响应计数不完整时保守识别未处理文件', () => {
    const outcome = createDocumentUploadOutcome({
      total: 3,
      successful_count: 1,
      failed_count: 0,
      successful: [],
      failed: [],
    })

    expect(outcome).toMatchObject({
      status: 'warning',
      total: 3,
      succeeded: 1,
      failed: 2,
    })
  })

  it('详情上限为零时只显示结果数量', () => {
    const outcome = createDocumentUploadOutcome({
      total: 2,
      successful_count: 1,
      failed_count: 1,
      successful: [],
      failed: [{ filename: '失败.pdf', error: '文件损坏' }],
    })

    expect(
      formatDocumentUploadOutcome(outcome, {
        successVerb: '已处理',
        completeFailure: '提交失败',
        detailLimit: 0,
      })
    ).toBe('已处理 1 个文件，1 个失败')
  })
})
