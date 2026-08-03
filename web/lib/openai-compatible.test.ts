import { describe, expect, it } from 'vitest'

import { isLocalOpenAICompatibleBaseUrl } from './openai-compatible'

describe('isLocalOpenAICompatibleBaseUrl', () => {
  it.each([
    'http://localhost:11434/v1',
    'http://127.0.0.1:11434/v1',
    'http://192.168.1.20:11434/v1',
    'http://ollama:11434/v1',
    'http://host.docker.internal:11434/v1',
  ])('识别本地免鉴权地址 %s', (baseUrl) => {
    expect(isLocalOpenAICompatibleBaseUrl(baseUrl)).toBe(true)
  })

  it('不把公网或无效地址识别为本地地址', () => {
    expect(isLocalOpenAICompatibleBaseUrl('https://api.openai.com/v1')).toBe(false)
    expect(isLocalOpenAICompatibleBaseUrl('not-a-url')).toBe(false)
  })
})
