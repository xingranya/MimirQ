import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'model-config-dialog.tsx'), 'utf8')
const providersSectionSource = readFileSync(
  resolve(__dirname, '../app/settings/_sections/model-providers-section.tsx'),
  'utf8'
)
const modelTypesSource = readFileSync(resolve(__dirname, '../types/models.ts'), 'utf8')

describe('模型配置弹窗视觉契约', () => {
  it('保留弹窗滚动边界并移除旧装饰样式', () => {
    expect(source).toContain('max-h-[calc(100dvh-1rem)] overflow-y-auto')
    expect(source).not.toMatch(/rounded-2xl|shadow-strong|linear-gradient|backdrop-blur/)
    expect(source).toContain('rounded-lg border border-border')
  })

  it('移动端字段和操作按钮保持可用，文案直接面向用户', () => {
    expect(source).toContain('flex-col')
    expect(source).toContain('sm:flex-row')
    expect(source).toContain('访问密钥')
    expect(source).toContain('服务地址')
    expect(source).not.toContain('最多输出字数')
    expect(source).not.toContain('获取 Key')
    expect(source).not.toContain('Max Tokens')
    const providerConfigSource = modelTypesSource.slice(
      modelTypesSource.indexOf('export interface ProviderConfig'),
      modelTypesSource.indexOf('export const MODEL_PROVIDERS')
    )
    expect(providerConfigSource).not.toContain('maxTokens')
  })

  it('模型选择使用可搜索浮层，并支持自动获取和手动填写', () => {
    expect(source).toContain("from '@/components/ui/popover'")
    expect(source).toContain('<CommandInput placeholder="搜索模型" />')
    expect(source).toContain('settingsApi.discoverModels')
    expect(source).toContain('获取模型')
    expect(source).toContain('手动填写')
    expect(source).toContain('disabled={requestBusy')
    expect(source).not.toContain('<select')
  })

  it('保存完成前保持弹窗，失败时保留配置和错误提示', () => {
    expect(source).toContain(
      'onSave: (providerId: string, config: ProviderConfig) => Promise<boolean>'
    )
    expect(source).toContain('const saved = await onSave(provider.id, config)')
    expect(source).toContain("setSaveError('保存失败，请检查配置和服务连接后重试。')")
    expect(source).toContain("{isSaving ? '保存中…' : '保存配置'}")
  })

  it('重排序模型使用真实检索配置入口，不渲染无效供应商卡片', () => {
    const configurableCategories = providersSectionSource.slice(
      providersSectionSource.indexOf('const CONFIGURABLE_CATEGORIES'),
      providersSectionSource.indexOf('const CATEGORY_INFO')
    )
    expect(configurableCategories).toContain("'model'")
    expect(configurableCategories).toContain("'embedding'")
    expect(configurableCategories).not.toContain("'reranker'")
    expect(providersSectionSource).toContain('href="#settings-retrieval"')
    expect(providersSectionSource).toContain('前往检索与生成')
  })
})
