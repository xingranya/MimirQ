// @vitest-environment happy-dom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Citation } from '@/types'

const mocks = vi.hoisted(() => ({
  openDocument: vi.fn(),
  onOpenChange: vi.fn(),
  reportClientWarning: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/store/document-view', () => ({
  useDocumentView: () => ({ openDocument: mocks.openDocument }),
}))

vi.mock('@/components/auth-image', () => ({
  AuthImage: () => null,
  useResolvedAuthAssetUrl: (src?: string | null) => src ?? null,
}))

vi.mock('@/lib/citation-images', () => ({
  resolveSafeCitationImageUrl: (src?: string | null) => src ?? null,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

vi.mock('@/lib/client-logging', () => ({
  reportClientWarning: mocks.reportClientWarning,
}))

import { EvidenceViewerDialog } from './evidence-viewer-dialog'

const citation = {
  document_id: 'document-1',
  chunk_id: 'chunk-1',
  document_name: '产品规范.pdf',
  page_number: 3,
  chunk_content: '这是用于回归测试的证据内容。',
  evidence_start_char: 10,
  evidence_end_char: 30,
  hit_type: 'text',
} as Citation

const imageCitation = {
  ...citation,
  hit_type: 'image',
  has_image: true,
  img_url: '/api/v1/documents/image/image-1',
} as Citation

function DialogHarness({ evidence = citation }: Readonly<{ evidence?: Citation }>) {
  const [open, setOpen] = useState(true)
  return (
    <EvidenceViewerDialog
      open={open}
      citation={open ? evidence : null}
      onOpenChange={(nextOpen) => {
        mocks.onOpenChange(nextOpen)
        setOpen(nextOpen)
      }}
    />
  )
}

describe('证据查看弹窗', () => {
  let container: HTMLDivElement
  let root: Root
  let originalClipboard: Clipboard | undefined

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    originalClipboard = navigator.clipboard
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
    document.body.innerHTML = ''
  })

  it('关闭证据弹窗后再打开对应文档', () => {
    act(() => root.render(<DialogHarness />))

    const openButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === '打开文档'
    )
    expect(openButton).toBeDefined()

    act(() => openButton?.click())

    expect(mocks.onOpenChange).toHaveBeenCalledWith(false)
    expect(mocks.openDocument).toHaveBeenCalledWith(
      'document-1',
      'chunk-1',
      { start: 10, end: 30 },
      expect.objectContaining({ previewAnchor: expect.any(Object) })
    )
    expect(mocks.onOpenChange.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openDocument.mock.invocationCallOrder[0]
    )
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('提供中文标题、说明和可访问的内容分组', () => {
    act(() => root.render(<DialogHarness />))

    expect(document.body.textContent).toContain('文本证据 · 产品规范.pdf · 第 3 页')
    expect(document.body.textContent).toContain('查看证据正文、来源位置和检索信息。')
    expect(document.body.querySelector('#evidence-content-title')?.textContent).toBe('证据内容')
    expect(document.body.querySelector('#evidence-metadata-title')?.textContent).toBe('溯源信息')
  })

  it('浏览器不提供剪贴板接口时明确提示详情复制失败', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    act(() => root.render(<DialogHarness />))

    await act(async () => {
      findButton('复制详情')?.click()
    })

    expect(mocks.toastError).toHaveBeenCalledWith('复制失败，请检查浏览器剪贴板权限')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.reportClientWarning).toHaveBeenCalledWith(
      'Evidence clipboard copy failed',
      expect.any(Error),
      { tags: { target: 'details' } }
    )
  })

  it('剪贴板拒绝写入时明确提示图片链接复制失败', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    act(() => root.render(<DialogHarness evidence={imageCitation} />))

    await act(async () => {
      findButton('复制图片链接')?.click()
    })

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/documents/image/image-1')
    )
    expect(mocks.toastError).toHaveBeenCalledWith('复制失败，请检查浏览器剪贴板权限')
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(mocks.reportClientWarning).toHaveBeenCalledWith(
      'Evidence clipboard copy failed',
      expect.any(Error),
      { tags: { target: 'image-link' } }
    )
  })

  function findButton(label: string) {
    return Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label
    )
  }
})
