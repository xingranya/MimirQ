import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { UI_LAYER_CLASS } from './ui-layers'

describe('全局界面层级', () => {
  it('按文档面板、导航、模态框、上下文弹层、通知和沉浸层递增', () => {
    const values = Object.values(UI_LAYER_CLASS).map((className) =>
      Number(className.replace('z-', ''))
    )

    expect(values).toEqual([30, 40, 50, 60, 70, 80, 90, 100])
    expect(new Set(values).size).toBe(values.length)
    expect(UI_LAYER_CLASS.contextual).toBe('z-80')
    expect(UI_LAYER_CLASS.modal).toBe('z-70')
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

  it('要求提示层通过 Portal 脱离滚动和裁切容器', () => {
    const tooltipSource = readFileSync(
      resolve(__dirname, '../components/ui/tooltip.tsx'),
      'utf8'
    )

    expect(tooltipSource).toContain('<TooltipPrimitive.Portal>')
    expect(tooltipSource).toContain('</TooltipPrimitive.Portal>')
  })

  it('要求 Popover 在窄屏内保留安全边距', () => {
    const popoverSource = readFileSync(
      resolve(__dirname, '../components/ui/popover.tsx'),
      'utf8'
    )

    expect(popoverSource).toContain('collisionPadding = 8')
    expect(popoverSource).toContain('max-w-[calc(100vw-1rem)]')
  })
})
