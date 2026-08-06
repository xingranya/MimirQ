import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('datasets-page server pagination contract', () => {
  it('uses the paginated dataset list query instead of exhaustive client filtering', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'datasets-page.tsx'), 'utf8')

    expect(src).toContain('const DATASET_SEARCH_DEBOUNCE_MS = 220')
    expect(src).toContain("const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')")
    expect(src).toContain('setDebouncedSearchQuery(trimmedSearchQuery)')
    expect(src).toContain('}, DATASET_SEARCH_DEBOUNCE_MS)')
    expect(src).toContain('maxLength={DATASET_SEARCH_MAX_LENGTH}')
    expect(src).toContain('buildDatasetListParams({')
    expect(src).toContain('searchQuery: debouncedSearchQuery')
    expect(src).toContain('queryKeys.datasets.list(datasetListParams)')
    expect(src).toContain('queryFn: () => datasetApi.list(datasetListParams)')
    expect(src).toContain('operational_status: input.collectionFilter')
    expect(src).toContain("order_by: input.sortBy === 'name_asc' ? 'name' : 'created_at'")
    expect(src).toContain("order_dir: input.sortBy === 'name_asc' ? 'asc' : 'desc'")
    expect(src).toContain('const scopeTotal = Number(response?.facets?.scope_total || 0)')
    expect(src).toContain('const filteredTotal = Number(response?.facets?.filtered_total || 0)')
    expect(src).not.toContain('datasetApi.listAll(datasetListParams)')
    expect(src).not.toContain('datasetApi.getIngestionStats(')
  })

  it('uses a two-column catalog with on-demand filter and inspector sheets', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'datasets-page.tsx'), 'utf8')

    expect(src).toContain('lg:grid-cols-[208px_minmax(0,1fr)]')
    expect(src).not.toContain('xl:grid-cols-[208px_minmax(0,1.2fr)_284px]')
    expect(src).toContain('<Sheet open={filtersOpen}')
    expect(src).toContain('<Sheet open={inspectorOpen}')
    expect(src).toContain('setInspectorOpen(true)')
    expect(src).toContain('className="lg:hidden"')
  })

  it('uses the shared tooltip instead of a clipped hover-only capability hint', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'datasets-page.tsx'), 'utf8')

    expect(src).toContain('<TooltipContent side="top"')
    expect(src).not.toContain('group-hover:translate-y-0 group-hover:opacity-100')
  })

  it('keeps the catalog surface flat and within the shared visual scale', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'datasets-page.tsx'), 'utf8')

    expect(src).not.toContain('backdrop-blur')
    expect(src).not.toContain('rounded-[')
    expect(src).not.toContain('rounded-xl')
    expect(src).not.toContain('rounded-2xl')
    expect(src).not.toContain('shadow-[')
  })

  it('keeps team datasets read-only for ordinary members', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'datasets-page.tsx'), 'utf8')

    expect(src).toContain('tenantAccessCanWriteDataset(tenantAccessQuery.data, dataset)')
    expect(src).toContain("permission: canManageTeamDatasets ? 'all_team_members' : 'only_me'")
    expect(src).toContain('可管理内容和处理配置')
    expect(src).toContain('你可以查看内容，但不能修改团队知识库')
    expect(src).toContain('canManageTeamAccess={canManageTeamDatasets}')
  })
})
