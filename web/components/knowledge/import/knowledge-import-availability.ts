import type { ConnectorInfo } from '@/types'
import { tenantAccessCanEditDatasets, type TenantAccess } from '@/lib/tenant-permissions'

const REQUIRED_URL_CONNECTORS = ['url_batch', 'web_crawl', 'jira_project'] as const

export type KnowledgeImportAvailability = {
  filesDisabledReason: string | null
  urlDisabledReason: string | null
  canRetry: boolean
}

export function resolveKnowledgeImportAvailability({
  isDevMode,
  tenantAccess,
  tenantAccessLoading,
  tenantAccessError,
  datasetsLoading,
  datasetsError,
  connectors,
  connectorsLoading,
  connectorsError,
}: Readonly<{
  isDevMode: boolean
  tenantAccess: TenantAccess | null | undefined
  tenantAccessLoading: boolean
  tenantAccessError: boolean
  datasetsLoading: boolean
  datasetsError: boolean
  connectors: ConnectorInfo[] | undefined
  connectorsLoading: boolean
  connectorsError: boolean
}>): KnowledgeImportAvailability {
  let filesDisabledReason: string | null = null

  if (!isDevMode) {
    if (tenantAccessLoading) {
      filesDisabledReason = '正在确认导入权限'
    } else if (tenantAccessError || !tenantAccess) {
      filesDisabledReason = '暂时无法确认导入权限'
    } else if (!tenantAccessCanEditDatasets(tenantAccess)) {
      filesDisabledReason = '当前账号没有导入知识库的权限'
    }
  }

  if (!filesDisabledReason && datasetsLoading) {
    filesDisabledReason = '正在加载知识库列表'
  } else if (!filesDisabledReason && datasetsError) {
    filesDisabledReason = '知识库列表加载失败'
  }

  let urlDisabledReason = filesDisabledReason
  if (!urlDisabledReason && connectorsLoading) {
    urlDisabledReason = '正在确认网页导入服务状态'
  } else if (!urlDisabledReason && connectorsError) {
    urlDisabledReason = '暂时无法确认网页导入服务状态'
  } else if (!urlDisabledReason) {
    const connectorById = new Map((connectors || []).map((connector) => [connector.id, connector]))
    const unavailableConnector = REQUIRED_URL_CONNECTORS
      .map((connectorId) => connectorById.get(connectorId))
      .find((connector) => !connector || connector.available === false)

    if (!unavailableConnector) {
      urlDisabledReason = null
    } else {
      urlDisabledReason = unavailableConnector.unavailable_reason || '当前服务未提供网页导入'
    }
  }

  return {
    filesDisabledReason,
    urlDisabledReason,
    canRetry: (!isDevMode && tenantAccessError) || datasetsError || connectorsError,
  }
}
