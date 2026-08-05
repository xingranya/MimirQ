import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sectionSource = readFileSync(
  resolve(__dirname, '_sections/ltr-model-registry-section.tsx'),
  'utf8'
)
const stateSource = readFileSync(resolve(__dirname, 'use-settings-page-state.ts'), 'utf8')
const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('LTR 模型注册区界面契约', () => {
  it('把已选文件名从状态层传到上传控件', () => {
    expect(stateSource).toContain("ltrUploadModelFileName: ltrUploadModelFile?.name || ''")
    expect(stateSource).toContain("ltrUploadManifestFileName: ltrUploadManifestFile?.name || ''")
    expect(pageSource).toContain('ltrUploadModelFileName={state.ltrUploadModelFileName}')
    expect(pageSource).toContain('ltrUploadManifestFileName={state.ltrUploadManifestFileName}')
    expect(sectionSource).toContain("ltrUploadModelFileName || '选择模型 JSON'")
    expect(sectionSource).toContain("ltrUploadManifestFileName || '选择清单 JSON'")
  })

  it('为移动端和桌面端提供独立的信息布局', () => {
    expect(sectionSource).toContain('data-testid="ltr-model-mobile-list"')
    expect(sectionSource).toContain('data-testid="ltr-model-desktop-table"')
    expect(sectionSource).toContain('space-y-2 md:hidden')
    expect(sectionSource).toContain('md:block')
  })

  it('使用扁平圆角并区分加载、失败和空数据状态', () => {
    expect(sectionSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(sectionSource).toContain('ltrLoading && ltrModels.length === 0')
    expect(sectionSource).toContain('ltrError && ltrModels.length === 0')
    expect(sectionSource).toContain('模型版本暂时无法加载')
    expect(sectionSource).toContain('还没有模型版本')
  })
})
