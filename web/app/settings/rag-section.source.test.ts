import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./_sections/rag-section.tsx', import.meta.url), 'utf8')

describe('RAG 设置区块契约', () => {
  it('按任务分组并折叠低频参数', () => {
    expect(source).toContain('基础检索')
    expect(source).toContain('重排序参数')
    expect(source).toContain('高级分块参数')
    expect(source.match(/<details/g)).toHaveLength(2)
  })

  it('移除旧卡片墙与装饰样式', () => {
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('bg-card/82')
    expect(source).not.toMatch(/rounded-\[(?:9|1\d|2\d)px\]/)
    expect(source).not.toContain('text-[11px]')
  })

  it('为范围与数字字段提供可访问名称', () => {
    expect(source).toContain('htmlFor={id}')
    expect(source).toContain('id={id}')
    expect(source).toContain('aria-describedby={descriptionId}')

    for (const id of [
      'rag-retrieval-top-k',
      'rag-similarity-threshold',
      'rag-chunk-size',
      'rag-chunk-overlap',
    ]) {
      expect(source).toContain(`id="${id}"`)
    }

    for (const id of [
      'rag-reranker-provider',
      'rag-reranker-top-n',
      'rag-image-append-max',
      'rag-chunk-min-chars',
    ]) {
      expect(source).toContain(`htmlFor="${id}"`)
      expect(source).toContain(`id="${id}"`)
    }
  })

  it('保留三项能力开关和对应更新字段', () => {
    expect(source).toContain("updateRag({ bm25_index_enabled: checked })")
    expect(source).toContain("updateRag({ enable_reranker: checked })")
    expect(source).toContain("updateRag({ show_image_in_answer: checked })")
  })
})
