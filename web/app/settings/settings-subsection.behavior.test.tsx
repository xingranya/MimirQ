// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import { SettingsSubsection } from './settings-subsection'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

async function renderSubsection(forceOpen: boolean) {
  if (!container) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  await act(async () => {
    root?.render(
      <SettingsSubsection id="object-storage" title="对象存储" advanced forceOpen={forceOpen}>
        <span>配置内容</span>
      </SettingsSubsection>
    )
  })
  return container.querySelector('details') as HTMLDetailsElement
}

async function toggleDetails(details: HTMLDetailsElement, open: boolean) {
  await act(async () => {
    details.open = open
    details.dispatchEvent(new Event('toggle', { bubbles: false }))
  })
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  container?.remove()
  container = null
})

describe('设置高级区展开状态', () => {
  it('搜索命中时强制展开，清空搜索后恢复原关闭状态', async () => {
    let details = await renderSubsection(true)
    expect(details.open).toBe(true)

    await toggleDetails(details, false)
    expect(details.open).toBe(true)

    details = await renderSubsection(false)
    expect(details.open).toBe(false)
  })

  it('用户手动展开的状态在搜索结束后仍然保留', async () => {
    let details = await renderSubsection(false)
    await toggleDetails(details, true)
    expect(details.open).toBe(true)

    details = await renderSubsection(true)
    expect(details.open).toBe(true)

    details = await renderSubsection(false)
    expect(details.open).toBe(true)
  })
})
