// @vitest-environment happy-dom

import { act, type ComponentProps } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LtrModelRegistrySection } from './ltr-model-registry-section'

const MODEL = {
  model_id: 'ltr-model-2026-08-05',
  model_sha256: '1234567890abcdef1234567890abcdef',
  size_bytes: 2048,
  created_at: '2026-08-05T08:00:00Z',
  created_by: 'owner@example.com',
  feature_spec_version: 1,
  feature_schema: 'ltr.features.v1',
  feature_names: ['bm25', 'vector'],
  has_manifest: true,
  active: false,
}

type Props = ComponentProps<typeof LtrModelRegistrySection>

function createProps(overrides: Partial<Props> = {}): Props {
  return {
    ltrError: null,
    ltrMessage: null,
    ltrUploading: false,
    ltrUploadManifestFileName: '',
    ltrUploadModelFileName: '',
    ltrUploadReady: false,
    ltrUploadResetKey: 0,
    ltrLoading: false,
    ltrBusyModelId: null,
    ltrModels: [],
    onRegister: vi.fn(),
    onRefreshList: vi.fn(),
    onRollback: vi.fn(),
    onActivate: vi.fn(),
    onModelFileChange: vi.fn(),
    onManifestFileChange: vi.fn(),
    formatBytes: () => '2 KB',
    formatTime: () => '2026-08-05 16:00',
    shortId: (value) => String(value),
    ...overrides,
  }
}

describe('LTR 模型注册区状态', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderSection(props: Props) {
    act(() => root.render(<LtrModelRegistrySection {...props} />))
  }

  it('加载、失败和空数据状态互不混用', () => {
    renderSection(createProps({ ltrLoading: true, ltrError: '请求失败' }))
    expect(container.textContent).toContain('正在加载模型版本')
    expect(container.textContent).not.toContain('模型版本暂时无法加载')
    expect(container.textContent).not.toContain('还没有模型版本')

    renderSection(createProps({ ltrError: '请求失败' }))
    expect(container.textContent).toContain('模型版本暂时无法加载')
    expect(container.textContent).toContain('请求失败')
    expect(container.textContent).not.toContain('还没有模型版本')

    renderSection(createProps())
    expect(container.textContent).toContain('还没有模型版本')
    expect(container.textContent).not.toContain('请求失败')
  })

  it('加载失败后可以重新请求模型列表', () => {
    const onRefreshList = vi.fn()
    renderSection(createProps({ ltrError: '网络暂时不可用', onRefreshList }))

    const retryButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '重新加载'
    )
    act(() => retryButton?.click())

    expect(onRefreshList).toHaveBeenCalledTimes(1)
  })

  it('显示已选择的模型文件和清单文件名称', () => {
    renderSection(
      createProps({
        ltrUploadModelFileName: 'ranking-model.json',
        ltrUploadManifestFileName: 'ranking-manifest.json',
        ltrUploadReady: true,
      })
    )

    expect(container.textContent).toContain('ranking-model.json')
    expect(container.textContent).toContain('ranking-manifest.json')
    const uploadButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '上传并注册'
    )
    expect(uploadButton?.disabled).toBe(false)
  })

  it('同时提供移动端版本卡片和桌面表格', () => {
    renderSection(createProps({ ltrModels: [MODEL] }))

    expect(container.querySelector('[data-testid="ltr-model-mobile-list"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="ltr-model-desktop-table"]')).not.toBeNull()
    expect(container.textContent).toContain('ltr-model-2026-08-05')
    expect(container.textContent).toContain('文件校验值')
  })
})
