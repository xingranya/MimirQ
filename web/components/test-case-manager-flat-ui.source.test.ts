import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, 'test-case-manager.tsx'),
  'utf8'
)

describe('基准评测样本管理界面', () => {
  it('保留创建、证据导入、运行和删除流程', () => {
    expect(source).toContain('handleCreateCaseFromEvidencePack')
    expect(source).toContain('handleChooseEvidencePack')
    expect(source).toContain('handleRunGolden')
    expect(source).toContain('handleRunSelected')
    expect(source).toContain('handleBatchDelete')
    expect(source).toContain('handleToggleGolden')
    expect(source).toContain('导入证据包')
    expect(source).toContain('创建基准样本')
  })

  it('让工具栏和证据弹窗适配窄屏', () => {
    expect(source).toContain('flex-col gap-3 xl:flex-row')
    expect(source).toContain('w-full flex-wrap items-center gap-2')
    expect(source).toContain('max-h-[min(90dvh,760px)]')
    expect(source).toContain('min-h-0 flex-1 space-y-5 overflow-y-auto')
    expect(source).toContain('shrink-0 gap-2 border-t')
  })

  it('为输入和标准证据提供可访问标签', () => {
    expect(source).toContain('htmlFor="regression-case-question"')
    expect(source).toContain('htmlFor="evidence-case-question"')
    expect(source).toContain('htmlFor={checkboxId}')
    expect(source).toContain('<Checkbox')
    expect(source).toContain('aria-describedby')
    expect(source).not.toContain('type="checkbox"')
  })

  it('区分加载失败与空数据，并允许用户重试', () => {
    expect(source).toContain('regressionCasesQuery.isError')
    expect(source).toContain('评测样本加载失败')
    expect(source).toContain('regressionCasesQuery.refetch()')
    expect(source).toContain('正在加载评测样本…')
  })

  it('拒绝过大的文件和属于其他数据集的证据包', () => {
    expect(source).toContain('file.size > EVIDENCE_PACK_MAX_BYTES')
    expect(source).toContain('证据包不能超过 5 MB')
    expect(source).toContain('resolveEvidencePackDataset')
    expect(source).toContain('证据包属于其他数据集')
    expect(source).toContain('写入当前数据集')
  })

  it('数据集切换后丢弃旧检索结果并阻止旧弹窗提交', () => {
    expect(source).toContain('datasetIdRef.current = datasetId')
    expect(source).toContain("datasetIdRef.current || '').trim() !== requestedDatasetId")
    expect(source).toContain('数据集已切换，请重新检索标准证据')
    expect(source).toContain('当前数据集已变化，请重新选择标准证据')
  })

  it('准确说明基准草稿取消人工确认后的状态', () => {
    expect(source).toContain('hasGolden && hasGoldenDraft')
    expect(source).toContain('已取消人工确认，样本仍保留为基准草稿')
    expect(source).toContain('取消人工确认，保留基准草稿')
  })

  it('移除旧视觉和用户可见的内部术语', () => {
    expect(source).not.toMatch(/rounded-(?:lg|xl|2xl|3xl|full)/)
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('gradient')
    expect(source).not.toMatch(/text-\[(?:9|10|11)(?:\.\d+)?px\]/)
    expect(source).not.toContain('Golden 评测')
    expect(source).not.toContain('Evidence Pack')
    expect(source).not.toContain('dataset_id:{')
    expect(source).not.toContain('citations:')
    expect(source).not.toContain("exported_at:{' '}")
    expect(source).not.toContain('reference_sources）')
    expect(source).not.toContain('chunk:')
    expect(source).not.toContain("'Unknown'")
  })
})
