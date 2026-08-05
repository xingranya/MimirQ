// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeatureFlags } from '@/lib/api'
import { ParserServicesSection } from './parser-services-section'

const FLAGS: FeatureFlags = {
  kg_enabled: false,
  deepdoc_enabled: false,
  docling_enabled: false,
  etl4llm_enabled: false,
  marker_enabled: false,
  paddle_vl_enabled: false,
  textin_enabled: false,
  markitdown_enabled: false,
  llama_index_enabled: false,
  mineru_enabled: false,
  magicpdf_enabled: false,
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  ;(
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
})

function renderSection({
  flags = FLAGS,
  searchQuery = '',
  settingsWritable = true,
  toggleFeature = vi.fn(),
}: {
  flags?: FeatureFlags
  searchQuery?: string
  settingsWritable?: boolean
  toggleFeature?: (key: keyof FeatureFlags) => void
} = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <ParserServicesSection
        mineru={{
          api_token: '',
          api_base: 'https://mineru.net/api/v4',
          model_version: 'vlm',
          backend: 'pipeline',
          local_server_url: '',
          vl_server: '',
        }}
        etl4llm={{
          api_url: '',
          timeout_sec: 120,
          mode: 'partition',
          force_ocr: false,
          enable_formula: true,
          extract_images: true,
          filter_page_header_footer: true,
        }}
        marker={{ api_url: '', timeout_sec: 600 }}
        paddleVl={{ api_url: '', timeout_sec: 600, pipeline_version: '', mode: '' }}
        textIn={{
          api_url: '',
          app_id: '',
          secret_code: '',
          timeout_sec: 180,
          parse_mode: 'auto',
          table_flavor: 'html',
          apply_document_tree: true,
          markdown_details: true,
          get_image: 'objects',
          dpi: 144,
          page_count: 0,
        }}
        magicPdf={{
          api_url: '',
          request_timeout_sec: 720,
          max_concurrent_jobs: 2,
          cli: 'magic-pdf',
          method: 'auto',
          lang: 'ch',
          debug: false,
          timeout_sec: 600,
          models_dir: '',
          device_mode: 'cpu',
          keep_artifacts: false,
        }}
        getFeatureValue={(key) => flags[key]}
        toggleFeature={toggleFeature}
        parserStatuses={{
          magicpdf: { enabled: true, available: false, message: '缺少模型' },
        }}
        searchQuery={searchQuery}
        settingsWritable={settingsWritable}
        updateMinerU={vi.fn()}
        updateEtl4Llm={vi.fn()}
        updateMarker={vi.fn()}
        updatePaddleVL={vi.fn()}
        updateTextIn={vi.fn()}
        updateMagicPDF={vi.fn()}
      />
    )
  })
  return { container, toggleFeature }
}

describe('解析服务任务行', () => {
  it('默认只显示六个服务摘要，不一次展开全部字段', () => {
    const rendered = renderSection()

    expect(rendered.container.querySelectorAll('[data-parser-service]')).toHaveLength(6)
    expect(rendered.container.querySelectorAll('button[aria-expanded="false"]')).toHaveLength(6)
    expect(rendered.container.querySelectorAll('input')).toHaveLength(0)
  })

  it('启用开关和配置展开位于同一个服务任务行', () => {
    const toggleFeature = vi.fn()
    const rendered = renderSection({ toggleFeature })
    const mineruPanel = rendered.container.querySelector('[data-parser-service="mineru"]')
    const openButton = mineruPanel?.querySelector<HTMLButtonElement>('button[aria-expanded]')
    const enableSwitch = mineruPanel?.querySelector<HTMLButtonElement>('[role="switch"]')

    act(() => enableSwitch?.click())
    expect(toggleFeature).toHaveBeenCalledWith('mineru_enabled')
    expect(openButton?.getAttribute('aria-expanded')).toBe('false')

    act(() => openButton?.click())
    expect(openButton?.getAttribute('aria-expanded')).toBe('true')
    expect(mineruPanel?.textContent).toContain('本地 MinerU API 地址')
  })

  it('搜索服务名时只展开对应配置', () => {
    const rendered = renderSection({ searchQuery: 'MagicPDF' })
    const magicPdfPanel = rendered.container.querySelector('[data-parser-service="magicpdf"]')

    expect(
      magicPdfPanel?.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')
    ).toBe('true')
    expect(magicPdfPanel?.textContent).toContain('模型目录')
    expect(rendered.container.querySelectorAll('button[aria-expanded="true"]')).toHaveLength(1)
    expect(magicPdfPanel?.textContent).toContain('暂不可用')
  })

  it('只读账号仍可展开查看配置，但不能修改字段或开关', () => {
    const rendered = renderSection({ settingsWritable: false })
    const markerPanel = rendered.container.querySelector('[data-parser-service="marker"]')
    const openButton = markerPanel?.querySelector<HTMLButtonElement>('button[aria-expanded]')
    const enableSwitch = markerPanel?.querySelector<HTMLButtonElement>('[role="switch"]')

    expect(openButton?.disabled).toBe(false)
    expect(enableSwitch?.disabled).toBe(true)
    act(() => openButton?.click())
    expect(markerPanel?.querySelector('input')?.closest('fieldset')?.disabled).toBe(true)
  })
})
