import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(__dirname, '_sections/object-storage-section.tsx'),
  'utf8'
)

describe('对象存储依赖开关', () => {
  it('关闭总开关时使用原子更新', () => {
    expect(source).toContain('getObjectStorageEnabledPatch(enabled)')
  })

  it('总开关关闭时禁用文档子开关并说明原因', () => {
    expect(source).toContain('disabled={!isEnabled}')
    expect(source).toContain('请先启用对象存储，再开启文档对象存储。')
  })

  it('合法状态仍按开关值更新', () => {
    expect(source).toContain('updateMinIO({ documents_enabled: checked })')
    expect(source).toContain('updateMinIO({ use_ssl: checked })')
  })
})
