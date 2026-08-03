import { describe, expect, it } from 'vitest'

import { filterGovernanceFiles } from './governance-file-search'

const files = [
  {
    id: 'contract',
    filename: '品牌合作合同.PDF',
    datasetName: '法务资料',
    sourcePath: '/contracts/2026',
    parser: 'MagicPDF',
    fileType: 'pdf',
  },
  {
    id: 'guide',
    filename: '员工手册.md',
    datasetName: '人事制度',
    sourcePath: '/handbook',
    parser: 'Markdown',
    fileType: 'markdown',
  },
]

describe('治理文件搜索', () => {
  it('可按文件名、数据集、路径和解析方式搜索', () => {
    expect(filterGovernanceFiles(files, '合同')).toEqual([files[0]])
    expect(filterGovernanceFiles(files, '人事')).toEqual([files[1]])
    expect(filterGovernanceFiles(files, 'CONTRACTS')).toEqual([files[0]])
    expect(filterGovernanceFiles(files, 'magicpdf')).toEqual([files[0]])
  })

  it('空搜索保留原列表且无匹配时返回空列表', () => {
    expect(filterGovernanceFiles(files, '  ')).toBe(files)
    expect(filterGovernanceFiles(files, '不存在的文件')).toEqual([])
  })
})
