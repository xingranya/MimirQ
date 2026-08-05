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
  writable: true,
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
        knowledge_map_json: '{"kb_policy":["00000000-0000-4000-8000-000000000001"]}',
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
          knowledge_map_json: '{"kb_policy":["00000000-0000-4000-8000-000000000001"]}',
        }),
      })
    )
    expect(hook.result.current.saveMessage?.detail).toBe(
      '多数配置会用于当前服务的后续请求。若部署了独立后台处理服务或多个后端进程，请重启相关服务，无需重新构建镜像。'
    )
    hook.unmount()
  })

  it('解析服务缺少连接参数时保留启用草稿且不发送保存请求', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.toggleFeature('etl4llm_enabled'))
    await act(async () => hook.result.current.saveSettings())

    expect(mocks.updateSettings).not.toHaveBeenCalled()
    expect(hook.result.current.saveMessage).toEqual({
      type: 'error',
      text: '解析服务：ETL4LLM 已启用，请填写服务地址。',
    })
    expect(hook.result.current.hasChanges).toBe(true)
    hook.unmount()
  })

  it('模型配置保存后保留其他设置草稿，且不提交无效字段', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.updateRag({ retrieval_top_k: 12 }))
    let saved = false
    await act(async () => {
      saved = await hook.result.current.handleSaveConfig('openai', {
        apiKey: 'secret',
        apiBase: 'https://api.example.test/v1',
        model: 'gpt-5.4-mini',
        temperature: 0.4,
        timeout: 45,
        maxTokens: 1234,
      })
    })

    expect(saved).toBe(true)
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      llm: {
        api_key: 'secret',
        api_base: 'https://api.example.test/v1',
        model: 'gpt-5.4-mini',
        temperature: 0.4,
        timeout: 45,
        max_retries: 3,
      },
    })
    expect(hook.result.current.ragMerged.retrieval_top_k).toBe(12)
    expect(hook.result.current.hasChanges).toBe(true)
    hook.unmount()
  })

  it('拒绝通过模型弹窗保存重排序配置', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    let saved = true
    await act(async () => {
      saved = await hook.result.current.handleSaveConfig('local-reranker', {
        model: 'BAAI/bge-reranker-v2-m3',
      })
    })

    expect(saved).toBe(false)
    expect(mocks.updateSettings).not.toHaveBeenCalled()
    expect(hook.result.current.saveMessage?.text).toBe('重排序服务请在“检索与生成”中配置。')
    hook.unmount()
  })

  it('模型配置保存失败时保留现有设置草稿', async () => {
    mocks.updateSettings.mockRejectedValueOnce(new Error('服务暂时不可用'))
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.updateRag({ retrieval_top_k: 18 }))
    let saved = true
    await act(async () => {
      saved = await hook.result.current.handleSaveConfig('openai', {
        apiKey: 'secret',
        apiBase: 'https://api.example.test/v1',
        model: 'gpt-5.4-mini',
      })
    })

    expect(saved).toBe(false)
    expect(hook.result.current.hasChanges).toBe(true)
    expect(hook.result.current.ragMerged.retrieval_top_k).toBe(18)
    expect(hook.result.current.saveMessage?.type).toBe('error')
    hook.unmount()
  })

  it('统一保存期间产生的新修改不会被完成回调清除', async () => {
    let resolveUpdate: ((value: { updated_keys: string[] }) => void) | undefined
    mocks.updateSettings.mockImplementationOnce(
      () =>
        new Promise<{ updated_keys: string[] }>((resolve) => {
          resolveUpdate = resolve
        })
    )
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.updateRag({ retrieval_top_k: 8 }))
    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = hook.result.current.saveSettings()
      void hook.result.current.saveSettings()
    })
    await waitForAssertion(() => expect(hook.result.current.saving).toBe(true))
    expect(mocks.updateSettings).toHaveBeenCalledOnce()

    act(() => hook.result.current.updateRag({ retrieval_top_k: 16 }))
    await act(async () => {
      resolveUpdate?.({ updated_keys: ['rag'] })
      await savePromise
    })

    expect(hook.result.current.ragMerged.retrieval_top_k).toBe(16)
    expect(hook.result.current.hasChanges).toBe(true)
    expect(hook.result.current.dirtySectionCount).toBe(1)
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

  it('编辑解析服务时保留后端返回的完整配置', async () => {
    mocks.getSettings.mockResolvedValue({
      ...settingsSnapshot,
      paddle_vl: {
        api_url: 'https://paddle.example.test/parse',
        timeout_sec: 600,
        pipeline_version: 'v2',
        mode: 'doc_parser',
      },
      magicpdf: {
        api_url: 'http://magicpdf.example.test/parse',
        request_timeout_sec: 720,
        max_concurrent_jobs: 2,
        cli: 'magic-pdf',
        method: 'auto',
        lang: 'ch',
        debug: false,
        timeout_sec: 600,
        models_dir: '/models',
        device_mode: 'cpu',
        keep_artifacts: false,
      },
    })
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.updatePaddleVL({ timeout_sec: 900 }))
    act(() => hook.result.current.updateMagicPDF({ method: 'ocr' }))
    await act(async () => hook.result.current.saveSettings())

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        paddle_vl: expect.objectContaining({
          pipeline_version: 'v2',
          mode: 'doc_parser',
          timeout_sec: 900,
        }),
        magicpdf: expect.objectContaining({
          api_url: 'http://magicpdf.example.test/parse',
          request_timeout_sec: 720,
          max_concurrent_jobs: 2,
          method: 'ocr',
        }),
      })
    )
    hook.unmount()
  })

  it('只读账号不能产生设置草稿或保存请求', async () => {
    mocks.getSettings.mockResolvedValue({ ...settingsSnapshot, writable: false })
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.toggleFeature('kg_enabled'))
    act(() => hook.result.current.updateRag({ retrieval_top_k: 10 }))
    await act(async () => hook.result.current.saveSettings())

    expect(hook.result.current.settingsWritable).toBe(false)
    expect(hook.result.current.hasChanges).toBe(false)
    expect(mocks.updateSettings).not.toHaveBeenCalled()
    hook.unmount()
  })

  it('首次加载失败时不把默认值当成系统配置，并可单独重试恢复', async () => {
    mocks.getSettings.mockRejectedValueOnce(new Error('配置服务暂时不可用'))
    const hook = renderHook(() => useSettingsPageState())

    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    expect(hook.result.current.hasSettingsSnapshot).toBe(false)
    expect(hook.result.current.settingsWritable).toBe(false)
    expect(hook.result.current.loadError).toContain('配置服务暂时不可用')

    mocks.getSettings.mockResolvedValueOnce(settingsSnapshot)
    await act(async () => hook.result.current.refreshSettings())

    expect(hook.result.current.hasSettingsSnapshot).toBe(true)
    expect(hook.result.current.settingsWritable).toBe(true)
    expect(hook.result.current.loadError).toBeNull()
    hook.unmount()
  })

  it('已有配置刷新失败时保留快照和未保存修改', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.updateRag({ retrieval_top_k: 10 }))
    expect(hook.result.current.hasChanges).toBe(true)

    mocks.getSettings.mockRejectedValueOnce(new Error('刷新暂时失败'))
    await act(async () => hook.result.current.refreshSettings({ preserveEdits: true }))

    expect(hook.result.current.hasSettingsSnapshot).toBe(true)
    expect(hook.result.current.settingsWritable).toBe(true)
    expect(hook.result.current.hasChanges).toBe(true)
    expect(hook.result.current.loadError).toContain('刷新暂时失败')
    hook.unmount()
  })

  it('分别展示运行状态和后端信息错误并支持独立重试', async () => {
    mocks.getStatus.mockRejectedValueOnce(new Error('运行状态服务暂时不可用'))
    mocks.metaDetails.mockRejectedValueOnce(new Error('后端信息服务暂时不可用'))
    const hook = renderHook(() => useSettingsPageState())

    await waitForAssertion(() => {
      expect(hook.result.current.loading).toBe(false)
      expect(hook.result.current.statusLoading).toBe(false)
      expect(hook.result.current.backendMetaLoading).toBe(false)
    })

    expect(hook.result.current.settingsWritable).toBe(true)
    expect(hook.result.current.statusError).toContain('运行状态服务暂时不可用')
    expect(hook.result.current.backendMetaError).toContain('后端信息服务暂时不可用')
    expect(hook.result.current.status).toBeNull()
    expect(hook.result.current.backendMeta).toBeNull()

    mocks.getStatus.mockResolvedValueOnce({
      database: { connected: true, message: '已连接' },
      milvus: { connected: true, message: '已连接' },
      llm: { configured: true, model: 'qwen3:8b' },
      embedding: { configured: true, model: 'BAAI/bge-large-zh-v1.5' },
      parsers: {},
    })
    const metadataCallCount = mocks.metaDetails.mock.calls.length
    await act(async () => hook.result.current.refreshSystemStatus())

    expect(hook.result.current.statusError).toBeNull()
    expect(hook.result.current.status?.database.connected).toBe(true)
    expect(mocks.metaDetails).toHaveBeenCalledTimes(metadataCallCount)
    expect(hook.result.current.backendMetaError).not.toBeNull()
    hook.unmount()
  })

  it('功能开关切回原值后清除草稿', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.toggleFeature('kg_enabled'))
    expect(hook.result.current.hasChanges).toBe(true)
    expect(hook.result.current.editedFeatureFlags).toEqual({ kg_enabled: true })

    act(() => hook.result.current.toggleFeature('kg_enabled'))
    expect(hook.result.current.hasChanges).toBe(false)
    expect(hook.result.current.editedFeatureFlags).toBeUndefined()
    hook.unmount()
  })

  it('功能开关保存时补全后端所需字段', async () => {
    const hook = renderHook(() => useSettingsPageState())
    await waitForAssertion(() => expect(hook.result.current.loading).toBe(false))

    act(() => hook.result.current.toggleFeature('kg_enabled'))
    await act(async () => hook.result.current.saveSettings())

    const submitted = mocks.updateSettings.mock.calls[0]?.[0]
    expect(submitted?.feature_flags).toEqual(
      expect.objectContaining({
        kg_enabled: true,
        deepdoc_enabled: false,
        magicpdf_enabled: false,
      })
    )
    expect(Object.keys(submitted?.feature_flags ?? {})).toHaveLength(11)
    hook.unmount()
  })
})
