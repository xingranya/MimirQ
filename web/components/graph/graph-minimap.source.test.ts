import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const minimapSource = fs.readFileSync(
  path.join(process.cwd(), 'components/graph/graph-minimap.tsx'),
  'utf8'
)
const viewerSource = fs.readFileSync(
  path.join(process.cwd(), 'components/graph/graph-viewer.tsx'),
  'utf8'
)

describe('图谱缩略图响应式与视觉契约', () => {
  it('桌面按可用宽度显示，移动端不遮挡底部操作', () => {
    expect(viewerSource).toContain('Math.round(width * 0.16)')
    expect(viewerSource).toContain('hidden md:block')
    expect(viewerSource).toContain('UI_LAYER_CLASS.floatingAction')
    expect(viewerSource).not.toContain('absolute bottom-24 right-6 z-10')
  })

  it('使用扁平容器和中文键盘语义', () => {
    expect(minimapSource).toContain('role="button"')
    expect(minimapSource).toContain('图谱缩略图，点击定位，按回车居中')
    expect(minimapSource).not.toContain('rounded-xl')
    expect(minimapSource).not.toContain('backdrop-blur')
    expect(minimapSource).not.toContain('shadow-sm')
  })
})
