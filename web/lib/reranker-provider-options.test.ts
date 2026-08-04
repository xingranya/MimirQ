import { describe, expect, it } from 'vitest'

import {
  normalizeRerankerProvider,
  RERANKER_PROVIDER_OPTIONS,
} from './reranker-provider-options'

describe('重排服务选项', () => {
  it('不向默认配置暴露缺少权重的加权重排', () => {
    expect(RERANKER_PROVIDER_OPTIONS.map((option) => String(option.key))).not.toContain('weighted')
    expect(normalizeRerankerProvider('weighted')).toBe('llm')
  })

  it('覆盖后端支持的阿里云和后交互名称', () => {
    expect(normalizeRerankerProvider('aliyun')).toBe('aliyun')
    expect(normalizeRerankerProvider('late-interaction')).toBe('late_interaction')
  })
})
