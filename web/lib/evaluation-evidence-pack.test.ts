import { describe, expect, it } from 'vitest'

import { resolveEvidencePackDataset } from './evaluation-evidence-pack'

describe('证据包目标数据集校验', () => {
  it('允许写入与证据包一致的当前数据集', () => {
    expect(resolveEvidencePackDataset('dataset-a', 'dataset-a')).toEqual({
      ok: true,
      datasetId: 'dataset-a',
    })
  })

  it('证据包未指定数据集时写入当前数据集', () => {
    expect(resolveEvidencePackDataset(' dataset-a ', ' ')).toEqual({
      ok: true,
      datasetId: 'dataset-a',
    })
  })

  it('拒绝属于其他数据集的证据包', () => {
    expect(resolveEvidencePackDataset('dataset-a', 'dataset-b')).toEqual({
      ok: false,
      reason: 'dataset_mismatch',
    })
  })

  it('没有当前数据集时不采用证据包中的数据集', () => {
    expect(resolveEvidencePackDataset('', 'dataset-b')).toEqual({
      ok: false,
      reason: 'missing_active_dataset',
    })
  })
})
