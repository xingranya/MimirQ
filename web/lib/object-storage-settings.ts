import type { MinIOConfig } from '@/lib/api'

/** 关闭对象存储时同步关闭依赖它的文档对象存储。 */
export function getObjectStorageEnabledPatch(
  enabled: boolean
): Partial<MinIOConfig> {
  return enabled
    ? { enabled: true }
    : { enabled: false, documents_enabled: false }
}
