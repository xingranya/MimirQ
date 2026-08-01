import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { UI_LAYER_CLASS } from './ui-layers'

describe('全局界面层级', () => {
  it('按文档面板、导航、弹层、模态框、通知和沉浸层递增', () => {
    const values = Object.values(UI_LAYER_CLASS).map((className) =>
      Number(className.replace('z-', ''))
    )

    expect(values).toEqual([30, 40, 50, 60, 70, 80, 90, 100])
    expect(new Set(values).size).toBe(values.length)
  })

  it('要求关键浮层组件复用统一层级契约', () => {
    const projectRoot = resolve(__dirname, '..')
    const componentFiles = [
      'components/navbar.tsx',
      'components/document-viewer/document-viewer-panel-shell.tsx',
      'components/document-viewer/floating-menu.tsx',
      'components/sonner-toaster.tsx',
      'components/chat/voice-mode-overlay.tsx',
      'components/ingestion/drop-zone.tsx',
      'components/business/chunk-strategy-dropdown.tsx',
      'components/ui/dialog.tsx',
      'components/ui/alert-dialog.tsx',
      'components/ui/sheet.tsx',
      'components/ui/popover.tsx',
      'components/ui/tooltip.tsx',
      'components/ui/dropdown-menu.tsx',
      'components/ui/select.tsx',
    ]

    for (const relativePath of componentFiles) {
      const source = readFileSync(resolve(projectRoot, relativePath), 'utf8')
      expect(source, relativePath).toContain('UI_LAYER_CLASS')
      expect(source, relativePath).not.toMatch(/z-\[\d+\]/)
    }
  })
})
