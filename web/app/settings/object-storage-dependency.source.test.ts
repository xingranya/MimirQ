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

  it('使用线性分区、统一控件尺寸和可访问字段标签', () => {
    expect(source).toContain('grid border-t border-border xl:grid-cols-2')
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('rounded-[16px]')
    expect(source).not.toContain('text-[10px]')
    expect(source).not.toContain('tracking-[0.12em]')

    for (const id of [
      'minio-endpoint',
      'minio-bucket',
      'minio-access-key',
      'minio-secret-key',
      'minio-image-max-bytes',
    ]) {
      expect(source).toContain(`htmlFor={id}`)
      expect(source).toContain(`id="${id}"`)
    }
  })
})
