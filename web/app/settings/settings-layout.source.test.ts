import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const layoutSource = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf8')
const localizedLayoutSource = readFileSync(
  resolve(__dirname, '../[locale]/settings/layout.tsx'),
  'utf8'
)
const localizedLoadingSource = readFileSync(
  resolve(__dirname, '../[locale]/settings/loading.tsx'),
  'utf8'
)
const gateSource = readFileSync(
  resolve(__dirname, '../../components/auth/tenant-permission-gate.tsx'),
  'utf8'
)
const pageSources = [
  'page.tsx',
  'rbac/page.tsx',
  'groups/page.tsx',
  'groups/[id]/page.tsx',
].map((path) => readFileSync(resolve(__dirname, path), 'utf8'))

describe('设置路由共享应用壳层', () => {
  it('普通路由和本地化路由复用同一设置布局', () => {
    expect(layoutSource).toContain('<AppFrame>{children}</AppFrame>')
    expect(localizedLayoutSource).toContain("export { default } from '../../settings/layout'")
    expect(localizedLoadingSource).toContain("export { default } from '../../settings/loading'")
  })

  it('设置页面不再各自挂载 AppFrame', () => {
    for (const source of pageSources) {
      expect(source).not.toContain("import { AppFrame }")
      expect(source).not.toContain('<AppFrame>')
      expect(source).toContain('withFrame={false}')
    }
  })

  it('权限门禁保留独立页面默认壳层，并允许共享布局关闭重复壳层', () => {
    expect(gateSource).toContain('withFrame = true')
    expect(gateSource).toContain('<PermissionGateFrame withFrame={withFrame}>')
    expect(gateSource).toContain('withFrame ? <AppFrame>{children}</AppFrame>')
  })
})
