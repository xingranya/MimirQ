import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const parsingRoot = __dirname
const readParsingSource = (fileName: string) =>
  readFileSync(resolve(parsingRoot, fileName), 'utf8')

const shellSource = readParsingSource('parsing-workbench-shell.tsx')
const activeFileSource = readParsingSource('parsing-active-file-pane.tsx')
const surfaceSource = [
  shellSource,
  activeFileSource,
  readParsingSource('parsing-left-panel.tsx'),
  readParsingSource('parsing-sidebar-pane.tsx'),
  readParsingSource('parsing-extract-panel.tsx'),
  readParsingSource('parsing-elements-panel.tsx'),
  readParsingSource('parsing-mobile-queue-content.tsx'),
  readParsingSource('parsing-mobile-inspector-content.tsx'),
  readParsingSource('parsing-library-preview-pane.tsx'),
  readParsingSource('parse-compare-dialog.tsx'),
  readParsingSource('pdf-viewer.tsx'),
].join('\n')

describe('文档解析工作区界面契约', () => {
  it('使用统一页头和稳定的桌面、移动端边界', () => {
    expect(shellSource).toContain('<AppFrame showBackground={false}>')
    expect(shellSource).toContain('iconImage="parsing"')
    expect(shellSource).toContain('className="hidden lg:flex"')
    expect(shellSource).toContain('2xl:flex')
    expect(shellSource).toContain('className="gap-2 lg:hidden"')
    expect(shellSource).toContain('className="flex items-center gap-2 2xl:hidden"')
    expect(shellSource).toContain('<WorkbenchPanelDialog')
    expect(shellSource).not.toContain('KnowledgeOpsHero')
  })

  it('主要界面不使用旧式装饰和过小字号', () => {
    expect(surfaceSource).not.toContain('bg-[linear-gradient')
    expect(surfaceSource).not.toContain('bg-[radial-gradient')
    expect(surfaceSource).not.toContain('backdrop-blur')
    expect(surfaceSource).not.toContain('rounded-2xl')
    expect(surfaceSource).not.toContain('rounded-xl')
    expect(surfaceSource).not.toContain('rounded-[18px]')
    expect(surfaceSource).not.toContain('rounded-[24px]')
    expect(surfaceSource).not.toContain('shadow-soft')
    expect(surfaceSource).not.toContain('text-[9')
    expect(surfaceSource).not.toContain('text-[10')
    expect(surfaceSource).not.toContain('text-[11')
  })

  it('高级信息默认折叠且用户可见文案使用自然中文', () => {
    expect(activeFileSource).toContain('解析摘要')
    expect(activeFileSource).toContain('<details className="group border-b')
    expect(surfaceSource).toContain('按字段')
    expect(surfaceSource).toContain('按要求')
    expect(surfaceSource).toContain('基准版本')
    expect(surfaceSource).toContain('对比版本')
    expect(surfaceSource).not.toContain('best-effort')
    expect(surfaceSource).not.toContain('>Schema<')
    expect(surfaceSource).not.toContain('>Prompt<')
    expect(surfaceSource).not.toContain(' segments')
  })

  it('保留解析、恢复、导出、抽取和治理调用', () => {
    expect(shellSource).toContain('documentApi.patchPipeline')
    expect(shellSource).toContain('documentApi.retry')
    expect(shellSource).toContain('restoreLibraryFileFromCache')
    expect(shellSource).toContain('requestRebindForLibraryFile')
    expect(shellSource).toContain('parseAllPending')
    expect(activeFileSource).toContain('onCopyMarkdown')
    expect(activeFileSource).toContain('onDownloadMarkdown')
    expect(activeFileSource).toContain('onSubmitToGovernance')
    expect(surfaceSource).toContain('parsingApi.extract')
  })
})
