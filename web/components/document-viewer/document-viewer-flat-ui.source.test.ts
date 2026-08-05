import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (filename: string) =>
  readFileSync(resolve(__dirname, filename), 'utf8')

const sources = [
  'document-viewer-panel-shell.tsx',
  'document-viewer-header.tsx',
  'preview-tab-panel.tsx',
  'text-tab-panel.tsx',
  'chunks-toolbar-panel.tsx',
  'chunk-renderer.tsx',
  'chunk-editor-dialog.tsx',
  'qa-generation-dialog.tsx',
  'floating-menu.tsx',
].map(readSource)

describe('文档查看器扁平视觉与中文文案契约', () => {
  it('查看器表面不使用毛玻璃、重阴影和大圆角', () => {
    for (const source of sources) {
      expect(source).not.toMatch(
        /backdrop-blur|shadow-(?:sm|lg|xl|2xl|soft|strong)|rounded-(?:xl|2xl|3xl)|rounded-\[/
      )
    }
  })

  it('编辑和问答弹窗使用中文操作文案', () => {
    const editorSource = readSource('chunk-editor-dialog.tsx')
    const qaSource = readSource('qa-generation-dialog.tsx')

    expect(editorSource).toContain('新增切片')
    expect(editorSource).toContain('起始字符位置')
    expect(editorSource).toContain('保存并重新嵌入')
    expect(qaSource).toContain('生成问答切片')
    expect(qaSource).toContain('替换已有问答切片')
    expect(qaSource).not.toContain('file_type=qa')
  })

  it('文本和切片视图不向用户展示内部字段或快捷键说明', () => {
    const textSource = readSource('text-tab-panel.tsx')
    const toolbarSource = readSource('chunks-toolbar-panel.tsx')
    const chunkSource = readSource('chunk-renderer.tsx')

    expect(textSource).not.toContain('无 chunk_id')
    expect(textSource).not.toContain('persist_parsed_content')
    expect(textSource).not.toContain('max_chars=')
    expect(toolbarSource).not.toContain('快捷键：')
    expect(toolbarSource).not.toContain('Add chunk')
    expect(chunkSource).not.toContain('Delete chunk')
  })

  it('图标按钮和输入框保留可访问名称', () => {
    const previewSource = readSource('preview-tab-panel.tsx')
    const editorSource = readSource('chunk-editor-dialog.tsx')

    expect(previewSource).toContain('aria-label="展开引用定位"')
    expect(previewSource).toContain('aria-label="收起引用定位"')
    expect(editorSource).toContain('htmlFor="chunk-editor-content"')
    expect(editorSource).toContain('id="chunk-editor-end"')
  })
})
