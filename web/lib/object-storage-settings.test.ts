import { describe, expect, it } from 'vitest'

import { getObjectStorageEnabledPatch } from './object-storage-settings'

describe('对象存储父子开关', () => {
  it('打开总开关时不覆盖文档对象存储草稿', () => {
    expect(getObjectStorageEnabledPatch(true)).toEqual({ enabled: true })
  })

  it('关闭总开关时同步关闭文档对象存储', () => {
    expect(getObjectStorageEnabledPatch(false)).toEqual({
      enabled: false,
      documents_enabled: false,
    })
  })
})
