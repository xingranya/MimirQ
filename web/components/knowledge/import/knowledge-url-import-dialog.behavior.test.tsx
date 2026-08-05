// @vitest-environment happy-dom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/pipeline-options-panel', () => ({
  PipelineOptionsPanel: () => <div>解析参数</div>,
}))
vi.mock('@/components/business/chunk-strategy-dropdown', () => ({
  ChunkStrategyDropdown: () => <button type="button">切片策略</button>,
}))
vi.mock('@/components/business/parser-dropdown', () => ({
  ParserDropdown: () => <button type="button">解析方式</button>,
}))
vi.mock('@/contexts/chunk-strategy-context', () => ({
  useChunkStrategyPreference: () => ({ chunkStrategy: 'langchain_recursive', setChunkStrategy: vi.fn() }),
}))
vi.mock('@/contexts/parser-backend-context', () => ({
  useParserBackendPreference: () => ({ parserBackend: 'auto', setParserBackend: vi.fn() }),
}))

import { KnowledgeUrlImportDialog } from './knowledge-url-import-dialog'

type UploadDocumentFromUrl = React.ComponentProps<typeof KnowledgeUrlImportDialog>['uploadDocumentFromUrl']

function DialogHarness({
  uploadDocumentFromUrl,
  onOpenChange,
}: Readonly<{
  uploadDocumentFromUrl: UploadDocumentFromUrl
  onOpenChange: (open: boolean) => void
}>) {
  const [open, setOpen] = useState(true)
  return (
    <KnowledgeUrlImportDialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        setOpen(nextOpen)
      }}
      datasets={[]}
      datasetsLoading={false}
      datasetDefaultValue="__default__"
      uploadDocumentFromUrl={uploadDocumentFromUrl}
      loadDocuments={vi.fn()}
    />
  )
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === text
  )
  expect(button, `未找到按钮：${text}`).toBeDefined()
  return button as HTMLButtonElement
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }))
}

describe('单个网址导入弹窗', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('请求未完成时仍可关闭，并保持按钮与焦点顺序一致', async () => {
    let resolveUpload: ((value: Awaited<ReturnType<UploadDocumentFromUrl>>) => void) | undefined
    const uploadDocumentFromUrl = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<UploadDocumentFromUrl>>>((resolve) => {
          resolveUpload = resolve
        })
    ) as UploadDocumentFromUrl
    const onOpenChange = vi.fn()

    await act(async () => {
      root.render(
        <DialogHarness
          uploadDocumentFromUrl={uploadDocumentFromUrl}
          onOpenChange={onOpenChange}
        />
      )
      await Promise.resolve()
    })

    const urlInput = document.body.querySelector('#knowledge-url-import-url') as HTMLInputElement
    expect(urlInput.required).toBe(true)
    await act(async () => {
      setInputValue(urlInput, 'https://example.com/manual.pdf')
      await Promise.resolve()
    })

    const submitButton = buttonByText('导入文档')
    const cancelButton = buttonByText('取消')
    expect(submitButton.compareDocumentPosition(cancelButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await act(async () => {
      submitButton.click()
      await Promise.resolve()
    })

    expect(uploadDocumentFromUrl).toHaveBeenCalledOnce()
    expect(buttonByText('取消').disabled).toBe(false)
    act(() => buttonByText('取消').click())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await act(async () => {
      resolveUpload?.({ id: 'document-1', dataset_id: 'dataset-1' } as never)
      await Promise.resolve()
    })
  })
})
