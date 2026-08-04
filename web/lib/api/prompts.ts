import type { OpenApiSchema } from '@/types/backend'

import { apiClient } from '@/lib/api/core'

export type PromptTemplate = OpenApiSchema<'PromptTemplateOut'>
type PromptTemplateCreateSchema = OpenApiSchema<'PromptTemplateCreate'>
type PromptTemplateUpdateSchema = OpenApiSchema<'PromptTemplateUpdate'>
type PromptTemplateNewVersionSchema = OpenApiSchema<'PromptTemplateNewVersion'>

export type PromptTemplateCreate = Omit<
  PromptTemplateCreateSchema,
  | 'template_key'
  | 'description'
  | 'category'
  | 'version'
  | 'ab_experiment_key'
  | 'ab_variant'
  | 'ab_weight'
> & {
  template_key?: string
  description?: string
  category?: string
  version?: number
  ab_experiment_key?: string
  ab_variant?: string
  ab_weight?: number
}

export type PromptTemplateUpdate = Omit<
  PromptTemplateUpdateSchema,
  'template_key' | 'description' | 'category' | 'ab_experiment_key' | 'ab_variant'
> & {
  template_key?: string
  description?: string
  category?: string
  ab_experiment_key?: string
  ab_variant?: string
}

export type PromptTemplateNewVersion = Omit<
  PromptTemplateNewVersionSchema,
  'description' | 'category' | 'ab_experiment_key' | 'ab_variant'
> & {
  description?: string
  category?: string
  ab_experiment_key?: string
  ab_variant?: string
}
export type PromptTemplateBuiltinSyncResponse = OpenApiSchema<'BuiltinPromptTemplateSyncResponse'>

type PromptTemplateListParams = {
  skip?: number
  limit?: number
  category?: string
  is_active?: boolean
}

type ExhaustivePromptTemplateListParams = Omit<
  PromptTemplateListParams,
  'skip' | 'limit'
> & {
  pageSize?: number
}

const DEFAULT_PROMPT_TEMPLATE_PAGE_SIZE = 200

async function listPromptTemplates(
  params?: PromptTemplateListParams
): Promise<{ total: number; items: PromptTemplate[] }> {
  const { data } = await apiClient.get('/prompt-templates', { params })
  return data
}

export async function listAllPromptTemplates(
  params?: ExhaustivePromptTemplateListParams
): Promise<PromptTemplate[]> {
  const requestedPageSize = Number(
    params?.pageSize ?? DEFAULT_PROMPT_TEMPLATE_PAGE_SIZE
  )
  const pageSize = Math.max(
    1,
    Math.min(
      DEFAULT_PROMPT_TEMPLATE_PAGE_SIZE,
      Math.trunc(requestedPageSize)
    )
  )
  const { pageSize: _pageSize, ...filters } = params || {}

  const items: PromptTemplate[] = []
  const seenIds = new Set<string>()
  let skip = 0
  let total = Number.POSITIVE_INFINITY

  while (items.length < total) {
    const page = await listPromptTemplates({ ...filters, skip, limit: pageSize })
    const pageItems = Array.isArray(page.items) ? page.items : []
    const reportedTotal = Number(page.total)
    total =
      Number.isFinite(reportedTotal) && reportedTotal >= 0
        ? reportedTotal
        : Number.POSITIVE_INFINITY
    if (pageItems.length === 0) break

    let added = 0
    for (const item of pageItems) {
      const id = String(item.id || '').trim()
      if (id && seenIds.has(id)) continue
      if (id) seenIds.add(id)
      items.push(item)
      added += 1
    }

    if (added === 0) break
    skip += pageItems.length
    if (pageItems.length < pageSize) break
  }

  return items
}

export const promptTemplateApi = {
  async create(params: PromptTemplateCreate): Promise<PromptTemplate> {
    const { data } = await apiClient.post('/prompt-templates', params)
    return data
  },

  list: listPromptTemplates,

  listAll: listAllPromptTemplates,

  async get(templateId: string): Promise<PromptTemplate> {
    const { data } = await apiClient.get(`/prompt-templates/${templateId}`)
    return data
  },

  async update(templateId: string, params: PromptTemplateUpdate): Promise<PromptTemplate> {
    const { data } = await apiClient.put(`/prompt-templates/${templateId}`, params)
    return data
  },

  async delete(templateId: string): Promise<void> {
    await apiClient.delete(`/prompt-templates/${templateId}`)
  },

  async duplicate(templateId: string): Promise<PromptTemplate> {
    const { data } = await apiClient.post(`/prompt-templates/${templateId}/duplicate`)
    return data
  },

  async createVersion(templateId: string, params: PromptTemplateNewVersion): Promise<PromptTemplate> {
    const { data } = await apiClient.post(`/prompt-templates/${templateId}/versions`, params)
    return data
  },

  async syncBuiltins(): Promise<PromptTemplateBuiltinSyncResponse> {
    const { data } = await apiClient.post('/prompt-templates/builtins/sync')
    return data
  },
}
