export const TENANT_PERMISSIONS = {
  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',
  OBSERVABILITY_READ: 'observability.read',
  USAGE_READ: 'usage.read',
  AUDIT_READ: 'audit.read',
  AUDIT_MANAGE: 'audit.manage',
  TABLE_SQL_READ: 'table_sql.read',
  LIFECYCLE_MANAGE: 'lifecycle.manage',
} as const

export type TenantPermission = (typeof TENANT_PERMISSIONS)[keyof typeof TENANT_PERMISSIONS]

export type TenantAccess = {
  tenant_id: string
  account_id: string
  role: string
  permissions: string[]
  navigation_user_visible_modules?: string[]
  is_active: boolean
  is_current: boolean
}

const DATASET_EDIT_ROLES = new Set(['owner', 'admin', 'editor', 'dataset_operator'])
const PERSONAL_DATASET_ROLES = new Set(['viewer'])

type DatasetAccessSubject = {
  owner_id?: string | null
  permission?: string | null
}

export function tenantAccessAllows(
  access: TenantAccess | null | undefined,
  permission: TenantPermission
): boolean {
  if (!access?.is_active) return false
  return new Set(access.permissions || []).has(permission)
}

export function tenantAccessCanEditDatasets(access: TenantAccess | null | undefined): boolean {
  if (!access?.is_active) return false
  return DATASET_EDIT_ROLES.has(
    String(access.role || '')
      .trim()
      .toLowerCase()
  )
}

export function tenantAccessCanCreateDatasets(access: TenantAccess | null | undefined): boolean {
  if (!access?.is_active) return false
  const role = String(access.role || '')
    .trim()
    .toLowerCase()
  return DATASET_EDIT_ROLES.has(role) || PERSONAL_DATASET_ROLES.has(role)
}

export function tenantAccessCanWriteDataset(
  access: TenantAccess | null | undefined,
  dataset: DatasetAccessSubject | null | undefined
): boolean {
  if (!access?.is_active || !dataset) return false
  if (tenantAccessCanEditDatasets(access)) return true

  return (
    String(access.role || '')
      .trim()
      .toLowerCase() === 'viewer' &&
    String(dataset.owner_id || '') === String(access.account_id || '') &&
    String(dataset.permission || '')
      .trim()
      .toLowerCase() === 'only_me'
  )
}
