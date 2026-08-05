import { describe, expect, it } from 'vitest'

import {
  analyzeWebCrawlUrls,
  buildWebCrawlRunPayload,
  parseWebCrawlUrls,
} from './knowledge-web-crawl-dialog.payload'

const baseInput = {
  datasetId: '__default__',
  datasetDefaultValue: '__default__',
  startUrls: 'https://example.com',
  filename: '',
  maxPages: 50,
  maxDepth: 3,
  sameHostOnly: true,
  includePatterns: '',
  excludePatterns: '',
  useSitemaps: false,
  sitemapUrls: '',
  respectRobots: false,
  dedupCanonical: true,
  userAgent: '',
  auth: null,
  parserBackend: 'auto',
  chunkStrategy: 'langchain_recursive',
  accessMode: 'inherit' as const,
  accessMembers: '',
  accessGroupIds: [],
}

describe('网页抓取任务参数', () => {
  it('只保留有效的 http(s) 地址并去重', () => {
    expect(
      parseWebCrawlUrls(
        'https://example.com\nftp://example.com\nnot-a-url\nhttps://example.com\nhttp://localhost:8000',
        5
      )
    ).toEqual(['https://example.com', 'http://localhost:8000'])
  })

  it('分别报告非法、重复和超限的网址', () => {
    expect(
      analyzeWebCrawlUrls(
        'https://a.example\nhttps://a.example\nftp://a.example\nhttps://b.example\nhttps://c.example',
        2
      )
    ).toEqual({
      urls: ['https://a.example', 'https://b.example'],
      invalidCount: 1,
      duplicateCount: 1,
      overflowCount: 1,
    })
  })

  it('把抓取范围限制在后端接受的边界内', () => {
    const payload = buildWebCrawlRunPayload({
      ...baseInput,
      maxPages: 5000,
      maxDepth: 50,
    })

    expect(payload.config.max_pages).toBe(500)
    expect(payload.config.max_depth).toBe(10)
  })

  it('关闭站点地图时不提交隐藏字段中的旧地址', () => {
    const payload = buildWebCrawlRunPayload({
      ...baseInput,
      sitemapUrls: 'https://example.com/sitemap.xml',
      useSitemaps: false,
    })

    expect(payload.config.sitemap_urls).toEqual([])
  })

  it('整理数据集、权限和可选字段', () => {
    const payload = buildWebCrawlRunPayload({
      ...baseInput,
      datasetId: 'dataset-1',
      filename: '  产品中心.html  ',
      userAgent: '  SEEWAY/1.0  ',
      accessMode: 'partial_members',
      accessMembers: 'alice\nalice\nbob',
      accessGroupIds: ['group-1', 'group-1', 'group-2'],
    })

    expect(payload.dataset_id).toBe('dataset-1')
    expect(payload.config.filename).toBe('产品中心.html')
    expect(payload.config.user_agent).toBe('SEEWAY/1.0')
    expect(payload.config.access).toEqual({
      mode: 'partial_members',
      partial_member_list: ['alice', 'bob'],
      partial_group_list: ['group-1', 'group-2'],
    })
  })
})
