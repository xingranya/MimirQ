import { describe, expect, it } from 'vitest'

import { resolveParsingWorkspaceDataset } from './parsing-workspace-dataset'

describe('resolveParsingWorkspaceDataset', () => {
  it('使用元数据中的目标数据集而不是工作区数据集', () => {
    expect(
      resolveParsingWorkspaceDataset(
        {
          target_dataset_id: 'dataset-target',
          target_dataset_name: '目标知识库',
        },
        new Map([['dataset-target', '映射名称']])
      )
    ).toEqual({
      datasetId: 'dataset-target',
      datasetName: '目标知识库',
    })
  })

  it('缺少目标名称时使用数据集列表中的名称', () => {
    expect(
      resolveParsingWorkspaceDataset(
        { target_dataset_id: 'dataset-target' },
        new Map([['dataset-target', '目标知识库']])
      )
    ).toEqual({
      datasetId: 'dataset-target',
      datasetName: '目标知识库',
    })
  })

  it('服务端元数据缺失时保留已有目标数据集', () => {
    expect(
      resolveParsingWorkspaceDataset(null, new Map(), {
        datasetId: 'dataset-existing',
        datasetName: '已有知识库',
      })
    ).toEqual({
      datasetId: 'dataset-existing',
      datasetName: '已有知识库',
    })
  })
})
