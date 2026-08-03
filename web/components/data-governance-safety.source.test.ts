import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const panelSource = readFileSync(
  resolve(__dirname, 'data-governance-panel.tsx'),
  'utf8'
)

describe('数据治理正文安全门禁', () => {
  it('读取知识库正文时记录两种截断标记', () => {
    expect(panelSource).toContain('remote.markdown_truncated')
    expect(panelSource).toContain('remote.original_markdown_truncated')
    expect(panelSource).toContain('GOVERNANCE_CONTENT_READ_LIMIT')
    expect(panelSource).toContain('updateContentTruncationState(id, contentTruncated)')
  })

  it('截断正文不能保存或提交切块', () => {
    expect(panelSource).toContain('throw new GovernanceContentIncompleteError()')
    expect(panelSource).toContain('selectedContentIsTruncated')
    expect(panelSource).toContain('selectedReadyContainsTruncatedContent')
    expect(panelSource).toContain("t('toasts.truncatedContentReadOnly')")
  })

  it('正文和治理状态通过同一个写回请求保存', () => {
    expect(panelSource).toContain('readGovernanceDocumentState(meta)')
    expect(panelSource).toContain('serializeGovernanceDocumentState(state)')
    expect(panelSource).toContain('governance: state')
    expect(panelSource).toContain('savedGovernanceState')
  })

  it('切换文档时重新建立治理工具实例', () => {
    expect(panelSource).toContain('key={`${selectedFileId}:${activeTab}`}')
  })

  it('离开页面或切换数据集前确认未保存修改', () => {
    expect(panelSource).toContain('enabled: hasUnsavedGovernanceChanges')
    expect(panelSource).toContain('setPendingDatasetScope(nextDatasetId)')
    expect(panelSource).toContain('<UnsavedChangesDialog')
    expect(panelSource).toContain('discardAllGovernanceChanges()')
  })

  it('文件搜索受控过滤且不会强制切换当前文档', () => {
    expect(panelSource).toContain(
      'filterGovernanceFiles(folderFiles, fileSearchQuery)'
    )
    expect(panelSource).toContain('value={fileSearchQuery}')
    expect(panelSource).toContain(
      'onChange={(event) => setFileSearchQuery(event.target.value)}'
    )
    expect(panelSource).toContain("t('sidebar.noSearchResults')")
    expect(panelSource).toContain(
      'selectedFileId && folderFiles.some((f) => f.id === selectedFileId)'
    )
  })

  it('窄屏使用互斥抽屉并关闭拖拽调宽', () => {
    expect(panelSource).toContain(
      "useMediaQuery('(max-width: 1279.98px)')"
    )
    expect(panelSource).toContain('setIsPanelCollapsed(true)')
    expect(panelSource).toContain('setIsSidebarCollapsed(true)')
    expect(panelSource).toContain("t('layout.closePanels')")
    expect(panelSource).toContain('xl:flex-row')
    expect(panelSource).toContain('xl:block')
    expect(panelSource).toContain("'min(100%, 400px)'")
  })
})
