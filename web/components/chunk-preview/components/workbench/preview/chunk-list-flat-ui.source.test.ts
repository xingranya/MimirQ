import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const chunkListSource = readFileSync(resolve(__dirname, 'chunk-list.tsx'), 'utf8')
const catalogSource = readFileSync(
  resolve(__dirname, '../../../../../i18n/messages/zh-CN/chunk-preview.ts'),
  'utf8'
)

describe('分块预览列表', () => {
  it('筛选和检索测试默认按需展开', () => {
    expect(chunkListSource).toContain('const [filtersOpen, setFiltersOpen] = useState(false)')
    expect(chunkListSource).toContain('const [retrieveOpen, setRetrieveOpen] = useState(false)')
    expect(chunkListSource).toContain('{filtersOpen ? (')
    expect(chunkListSource).toContain('{retrieveOpen ? (')
    expect(chunkListSource).toContain('id="chunk-list-filter-panel"')
    expect(chunkListSource).toContain('data-chunk-retrieval-panel')
  })

  it('保留虚拟列表、批量操作、审核和重排序链路', () => {
    for (const marker of [
      'useVirtualizer({',
      '<ChunkCard',
      'setChunksDisabled(targets, true)',
      'setChunksDisabled(targets, false)',
      'toggleChunkDisabled(index)',
      'setChunkReviewed(index, !chunkIsReviewed(chunk))',
      'rerankChunkSearchResults(',
      'onClick={() => runPreview()}',
    ]) {
      expect(chunkListSource).toContain(marker)
    }
  })

  it('使用扁平容器和可读控件尺寸', () => {
    expect(chunkListSource).toContain("'h-8 rounded-md px-2 text-xs'")
    expect(chunkListSource).toContain('className="min-h-full"')
    expect(chunkListSource).not.toContain('h-[28px]')

    for (const forbidden of [
      'bg-[linear-gradient',
      'bg-[radial-gradient',
      'backdrop-blur',
      'shadow-[',
      'shadow-lg',
      'rounded-xl',
      'rounded-2xl',
      'rounded-3xl',
      'font-black',
      'uppercase',
      'tracking-[',
    ]) {
      expect(chunkListSource).not.toContain(forbidden)
    }
    expect(chunkListSource).not.toMatch(/text-\[(?:[0-9]|1[01])(?:\.[0-9]+)?px\]/)
  })

  it('保留搜索清除按钮和移动端换行边界', () => {
    expect(chunkListSource).toContain('data-chunk-list-search')
    expect(chunkListSource).toContain("aria-label={t('chunkList.clearSearch')}")
    expect(chunkListSource).toContain('flex min-w-0 flex-wrap items-center gap-2')
    expect(chunkListSource).toContain('min-w-[220px] flex-1')
  })

  it('列表筛选与检索文案使用自然中文', () => {
    expect(catalogSource).toContain("placeholder: '视图'")
    expect(catalogSource).toContain("trigger: '批量操作'")
    expect(catalogSource).toContain("trigger: '检索测试'")
    expect(catalogSource).toContain("rerank: '重排序'")
    expect(catalogSource).toContain("ariaLabel: '切块列表'")

    for (const oldCopy of [
      "placeholder: 'View'",
      "hierarchy: 'Hierarchy'",
      "trigger: 'Batch'",
      "trigger: 'Retrieve'",
      "rerank: 'Rerank'",
      "noResults: 'No results.'",
      "ariaLabel: 'Chunk list'",
    ]) {
      expect(catalogSource).not.toContain(oldCopy)
    }
  })
})
