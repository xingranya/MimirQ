// @vitest-environment happy-dom

import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UnsavedChangesDialog } from './unsaved-changes-dialog'

function DialogHarness({
  discardDisabled = false,
  onDiscard,
}: Readonly<{
  discardDisabled?: boolean
  onDiscard: () => void
}>) {
  const [open, setOpen] = useState(true)
  return (
    <UnsavedChangesDialog
      open={open}
      onOpenChange={setOpen}
      onDiscard={onDiscard}
      discardDisabled={discardDisabled}
    />
  )
}

function buttonByName(name: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (item) => item.textContent?.trim() === name
  )
  expect(button, `未找到按钮：${name}`).toBeDefined()
  return button as HTMLButtonElement
}

async function renderDialog(
  props: React.ComponentProps<typeof DialogHarness>
): Promise<Root> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<DialogHarness {...props} />)
    await Promise.resolve()
  })
  return root
}

describe('未保存修改确认框', () => {
  beforeEach(() => {
    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('保存进行中禁止放弃，但允许关闭确认框继续编辑', async () => {
    const onDiscard = vi.fn()
    const root = await renderDialog({ discardDisabled: true, onDiscard })

    const discardButton = buttonByName('放弃修改')
    expect(discardButton.disabled).toBe(true)
    act(() => discardButton.click())
    expect(onDiscard).not.toHaveBeenCalled()
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull()

    act(() => buttonByName('继续编辑').click())
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()

    act(() => root.unmount())
  })

  it('确认放弃时只调用一次回调并关闭确认框', async () => {
    const onDiscard = vi.fn()
    const root = await renderDialog({ onDiscard })

    act(() => buttonByName('放弃修改').click())
    expect(onDiscard).toHaveBeenCalledOnce()
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()

    act(() => root.unmount())
  })
})
