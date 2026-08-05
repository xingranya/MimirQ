import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'evidence-viewer-dialog.tsx'), 'utf8')

describe('证据查看弹窗视觉契约', () => {
  it('保持扁平容器和移动端纵向操作布局', () => {
    expect(source).toContain('max-h-[min(90dvh,760px)]')
    expect(source).toContain('flex w-full flex-col gap-2 sm:w-auto sm:flex-row')
    expect(source).toContain('onCloseAutoFocus={handleCloseAutoFocus}')
    expect(source).not.toContain('rounded-xl')
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('backdrop-blur')
  })

  it('使用中文对外文案并避免暴露英文内部标题', () => {
    expect(source).toContain('图片证据')
    expect(source).toContain('证据内容')
    expect(source).toContain('溯源信息')
    expect(source).not.toContain('Image Evidence')
    expect(source).not.toContain('Table Evidence')
    expect(source).not.toContain('Evidence Snippet')
    expect(source).not.toContain('Provenance')
  })

  it('详情和图片链接复制失败时提供统一反馈', () => {
    expect(source).toContain("copyToClipboard(JSON.stringify(citation, null, 2), 'details')")
    expect(source).toContain("copyToClipboard(resolvedImgUrl, 'image-link')")
    expect(source).toContain("toast.error('复制失败，请检查浏览器剪贴板权限')")
    expect(source).toContain("reportClientWarning('Evidence clipboard copy failed'")
  })
})
