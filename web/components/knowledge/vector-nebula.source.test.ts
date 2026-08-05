import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, 'vector-nebula.tsx'), 'utf8')

describe('语义分布页面视觉与状态契约', () => {
  it('使用全幅画布、容器尺寸和可收起的响应式概览', () => {
    expect(source).toContain('data-vector-nebula="true"')
    expect(source).toContain('useResizeObserver(viewportRef)')
    expect(source).toContain('width={width}')
    expect(source).toContain('height={height}')
    expect(source).toContain('max-h-[min(46dvh,360px)]')
    expect(source).toContain('sm:w-[360px]')
    expect(source).toContain('收起语义分布概览')
    expect(source).toContain('重置语义分布视图')
  })

  it('移除旧毛玻璃、发光和内部接口文案', () => {
    expect(source).not.toContain('backdrop-blur')
    expect(source).not.toContain('shadow-')
    expect(source).not.toContain('rounded-xl')
    expect(source).not.toContain('AdditiveBlending')
    expect(source).not.toContain('/documents/:id/chunks')
    expect(source).not.toContain('真实 chunk')
    expect(source).not.toContain('后端暂无')
  })

  it('区分整体失败、逐文档失败、空数据和缓存刷新失败', () => {
    expect(source).toContain('语义分布加载失败')
    expect(source).toContain('切片暂时无法读取')
    expect(source).toContain('暂无可视化切片')
    expect(source).toContain('刷新失败，当前继续显示上一次成功读取的结果。')
    expect(source).toContain('failedDocumentCount')
  })
})
