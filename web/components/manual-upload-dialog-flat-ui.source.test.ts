import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'manual-upload-dialog.tsx'), 'utf8')

describe('高级切片上传弹窗视觉与请求契约', () => {
  it('使用扁平表面和移动端纵向布局', () => {
    expect(source).toContain('flex min-h-0 flex-col overflow-hidden md:flex-row')
    expect(source).toContain('md:w-[360px]')
    expect(source).not.toMatch(
      /rounded-(?:xl|2xl|3xl)|backdrop-blur|shadow-(?:sm|lg|xl|soft|strong)|text-\[(?:10|11)px\]/
    )
  })

  it('预览请求使用文件兼容的解析器并忽略过期响应', () => {
    expect(source).toContain(
      'resolveParserBackendForFilename(selected.name, parserBackend).backend'
    )
    expect(source).toContain('documentApi.preview(\n        selected,\n        resolvedBackend,')
    expect(source).toContain('previewAbortRef.current !== controller')
    expect(source).toContain('previewAbortRef.current?.abort()')
  })

  it('关闭弹窗统一清理请求和本地状态', () => {
    expect(source).toContain('onOpenChange={handleOpenChange}')
    expect(source).toContain('handleOpenChange(false)')
    expect(source).not.toContain('onClick={() => setOpen(false)}')
  })

  it('切片方式和数值控件提供可访问状态与标签', () => {
    expect(source).toContain("aria-pressed={mode === 'page'}")
    expect(source).toContain('htmlFor="manual-chunk-size"')
    expect(source).toContain('id="manual-chunk-overlap"')
    expect(source).toContain('id="manual-chunk-delimiter"')
  })
})
