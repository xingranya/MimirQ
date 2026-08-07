import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { UI_LAYER_CLASS } from './ui-layers'

describe('全局界面层级', () => {
  it('按文档面板、导航、模态框、上下文弹层、通知和沉浸层递增', () => {
    const values = Object.values(UI_LAYER_CLASS).map((className) =>
      Number(className.replace('z-', ''))
    )

    expect(values).toEqual([20, 30, 40, 50, 60, 70, 80, 90, 100])
    expect(new Set(values).size).toBe(values.length)
    expect(UI_LAYER_CLASS.floatingAction).toBe('z-20')
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
      'components/business/parser-dropdown.tsx',
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

  it('两个解析配置下拉框使用 Portal、碰撞边界和统一控件尺寸', () => {
    const projectRoot = resolve(__dirname, '..')
    const parserSource = readFileSync(
      resolve(projectRoot, 'components/business/parser-dropdown.tsx'),
      'utf8'
    )
    const chunkSource = readFileSync(
      resolve(projectRoot, 'components/business/chunk-strategy-dropdown.tsx'),
      'utf8'
    )

    expect(parserSource).toContain('createPortal(')
    expect(parserSource).toContain('role="listbox"')
    expect(parserSource).toContain('UI_LAYER_CLASS.contextual')
    expect(parserSource).toContain('Math.max(240, viewportWidth - 24)')
    expect(parserSource).not.toContain('rounded-2xl')
    expect(parserSource).not.toContain('shadow-strong')

    expect(chunkSource).toContain('createPortal(')
    expect(chunkSource).toContain('UI_LAYER_CLASS.contextual')
    expect(chunkSource).toContain('flex h-10 w-full items-center')
    expect(chunkSource).not.toContain('text-[9px]')
    expect(chunkSource).not.toContain('text-[11px]')
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

  it('要求挂载到 Portal 的下拉内容在模态框内仍可交互', () => {
    const componentRoot = resolve(__dirname, '../components/ui')
    const interactiveOverlayFiles = ['popover.tsx', 'select.tsx', 'dropdown-menu.tsx']

    for (const filename of interactiveOverlayFiles) {
      const source = readFileSync(resolve(componentRoot, filename), 'utf8')
      expect(source, filename).toContain('pointer-events-auto')
    }

    const commandSource = readFileSync(resolve(componentRoot, 'command.tsx'), 'utf8')
    expect(commandSource).toContain('data-[disabled=true]:pointer-events-none')
    expect(commandSource).not.toContain('data-[disabled]:pointer-events-none')
  })

  it('要求 Dialog 在窄屏内保留可滚动的视口边界', () => {
    const dialogSource = readFileSync(
      resolve(__dirname, '../components/ui/dialog.tsx'),
      'utf8'
    )

    expect(dialogSource).toContain('max-h-[calc(100dvh-1.5rem)]')
    expect(dialogSource).toContain('overflow-y-auto')
    expect(dialogSource).toContain('size-11')
  })
})
