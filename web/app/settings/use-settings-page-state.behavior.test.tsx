// @vitest-environment happy-dom

import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook, waitForAssertion } from '@/test/hook-harness'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getStatus: vi.fn(),
  listLtrModels: vi.fn(),
  metaDetails: vi.fn(),
  refreshCapabilities: vi.fn(),
  updateSettings: vi.fn(),
}))

vi.mock('@/contexts/pipeline-capabilities-context', () => ({
  usePipelineCapabilities: () => ({ refresh: mocks.refreshCapabilities }),
}))

vi.mock('@/lib/api', () => ({
  ltrApi: {
    activateModel: vi.fn(),
    listModels: mocks.listLtrModels,
    registerModel: vi.fn(),
    rollbackActiveModel: vi.fn(),
  },
  metaApi: { details: mocks.metaDetails },
  settingsApi: {
    get: mocks.getSettings,
    getStatus: mocks.getStatus,
    update: mocks.updateSettings,
  },
}))

import { useSettingsPageState } from './use-settings-page-state'

const settingsSnapshot = {
  llm: {
    api_key: '',
    api_base: '',
    model: '',
    temperature: 0.7,
    timeout: 60,
    max_retries: 3,
  },
  embedding: {
    provider: 'local',
    model: '',
    api_key: '',
    api_base: '',
  },
  dify_external_knowledge: {
    enabled: false,
    api_keys: '',
    tenant_id: '',
    account_id: 'system:dify',
    knowledge_map_json: '',
    top_k_max: 20,
    endpoint_path: '/api/v1/integrations/dify/retrieval',
  },
  minio: {
    enabled: false,
    endpoint: 'mimirq-minio:9000',
    access_key: '',
    secret_key: '',
    bucket_name: 'mimirq',
    use_ssl: false,
    documents_enabled: false,
    image_max_bytes: 0,
  },
}

describe('设置页保存校验', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue(settingsSnapshot)
    mocks.getStatus.mockResolvedValue(null)
    mocks.listLtrModels.mockResolvedValue({ items: [] })
    mocks.metaDetails.mockResolvedValue(null)
    mocks.refreshCapabilities.mockResolvedValue(undefined)
    mocks.updateSettings.mockResolvedValue({ updated_keys: [] })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('Dify 知识绑定无效时不发送保存请求', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => {
      hook.result.current.updateDifyExternalKnowledge({
        enabled: true,
        api_keys: 'valid-key',
        knowledge_map_json: '{',
      })
    })
    await act(async () => {
      await hook.result.current.saveSettings()
    })

    expect(mocks.updateSettings).not.toHaveBeenCalled()
    expect(hook.result.current.saveMessage).toEqual({
      type: 'error',
      text: 'Dify 外部知识库：知识绑定不是有效的 JSON，请重新生成绑定。',
    })
    expect(hook.result.current.hasChanges).toBe(true)
    hook.unmount()
  })

  it('对象存储缺少凭证时保留修改且不发送保存请求', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => {
      hook.result.current.updateMinIO({ enabled: true })
    })
    await act(async () => {
      await hook.result.current.saveSettings()
    })

    expect(mocks.updateSettings).not.toHaveBeenCalled()
    expect(hook.result.current.saveMessage?.text).toBe(
      '对象存储：请同时填写 Access Key 和 Secret Key。'
    )
    expect(hook.result.current.hasChanges).toBe(true)
    hook.unmount()
  })

  it('有效配置通过统一保存入口提交', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => {
      hook.result.current.updateDifyExternalKnowledge({
        enabled: true,
        api_keys: 'valid-key',
        knowledge_map_json:
          '{"kb_policy":["00000000-0000-4000-8000-000000000001"]}',
      })
    })
    await act(async () => {
      await hook.result.current.saveSettings()
    })

    expect(mocks.updateSettings).toHaveBeenCalledTimes(1)
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        dify_external_knowledge: expect.objectContaining({
          enabled: true,
          knowledge_map_json:
            '{"kb_policy":["00000000-0000-4000-8000-000000000001"]}',
        }),
      })
    )
    hook.unmount()
  })

  it('缩小分块时同步收紧重叠值并使用有效默认策略', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    expect(hook.result.current.ragMerged.default_chunk_strategy).toBe('langchain_recursive')
    act(() => hook.result.current.updateRag({ chunk_overlap: 900 }))
    act(() => hook.result.current.updateRag({ chunk_size: 500 }))

    expect(hook.result.current.ragMerged.chunk_size).toBe(500)
    expect(hook.result.current.ragMerged.chunk_overlap).toBe(499)
    hook.unmount()
  })
})
