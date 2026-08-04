import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const parentSource = readFileSync(
  resolve(__dirname, '../document-detail-dialog.tsx'),
  'utf8'
)
const dialogSource = readFileSync(
  resolve(__dirname, 'document-access-dialog.tsx'),
  'utf8'
)

describe('文档权限读取与保存保护', () => {
  it('保留权限读取异常并在提交前再次检查快照', () => {
    expect(parentSource).toContain('queryFn: () => documentApi.getAccess(initialDocument.id)')
    expect(parentSource).toContain("formatApiError(accessQuery.error, '文档权限加载失败')")
    expect(parentSource).toContain('const accessReady = Boolean(accessInfo) && !accessError')
    expect(parentSource).toContain('if (!accessInfo || accessQuery.error)')
    expect(parentSource).toContain('文档权限尚未加载，无法保存。请重新加载后再试。')
  })

  it('弹窗等待真实权限数据后才允许编辑和保存', () => {
    expect(parentSource).toContain('if (!accessDialogOpen || !accessInfo || accessQuery.error) return')
    expect(parentSource).toContain('accessReady={accessReady}')
    expect(parentSource).toContain('accessLoading={accessQuery.isFetching && !accessInfo}')
    expect(dialogSource).toContain('const formDisabled = pending || !accessReady')
    expect(dialogSource).toContain('disabled={formDisabled}')
    expect(dialogSource).toContain('<DocumentAccessSaveButton disabled={!accessReady} />')
    expect(dialogSource).toContain('title="文档权限加载失败"')
  })
})
