import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')
const surfaceSource = [
  pageSource,
  readFileSync(
    resolve(__dirname, '../../components/kg-extract-prompt-settings.tsx'),
    'utf8'
  ),
  readFileSync(
    resolve(__dirname, '../../components/kg-predicate-ontology-settings.tsx'),
    'utf8'
  ),
].join('\n')

describe('提示词工作区界面契约', () => {
  it('使用完整列表并保护系统模板', () => {
    expect(pageSource).toContain('promptTemplateApi.listAll()')
    expect(pageSource).toContain(
      '.filter((template) => !template.is_system)'
    )
    expect(pageSource).toContain('disabled={template.is_system}')
    expect(pageSource).toContain('batchAction !== null')
  })

  it('移动端使用两列列表并在桌面展开完整字段', () => {
    expect(pageSource).toContain('grid-cols-[32px_minmax(0,1fr)]')
    expect(pageSource).toContain(
      'lg:grid-cols-[40px_minmax(220px,1fr)_90px_64px_130px_136px_184px]'
    )
    expect(pageSource).not.toContain('min-w-[1080px]')
  })

  it('主要界面不使用旧式装饰和过小字号', () => {
    expect(surfaceSource).not.toContain('bg-[linear-gradient')
    expect(surfaceSource).not.toContain('backdrop-blur')
    expect(surfaceSource).not.toContain('rounded-2xl')
    expect(surfaceSource).not.toContain('rounded-xl')
    expect(surfaceSource).not.toContain('text-[9')
    expect(surfaceSource).not.toContain('text-[10')
    expect(surfaceSource).not.toContain('text-[11')
  })

  it('保留模板管理和场景配置接口', () => {
    expect(pageSource).toContain('promptTemplateApi.create')
    expect(pageSource).toContain('promptTemplateApi.update')
    expect(pageSource).toContain('promptTemplateApi.delete')
    expect(pageSource).toContain('promptTemplateApi.duplicate')
    expect(pageSource).toContain('promptTemplateApi.syncBuiltins')
    expect(surfaceSource).toContain('settingsApi.update')
    expect(surfaceSource).toContain('kgApi.upsertPredicateOntology')
  })
})
