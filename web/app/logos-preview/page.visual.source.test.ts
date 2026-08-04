import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('供应商图标页视觉契约', () => {
  it('使用单层扁平分区并支持窄屏布局', () => {
    expect(pageSource).toContain('data-provider-icon-catalog="true"')
    expect(pageSource).toContain('grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')
    expect(pageSource).toContain('grid-cols-1 gap-px bg-border md:grid-cols-3')
    expect(pageSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(pageSource).not.toContain('shadow-')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('gradient')
  })

  it('不再向用户展示开发命令和资源路径', () => {
    expect(pageSource).not.toContain('使用说明')
    expect(pageSource).not.toContain('/public/logos/')
    expect(pageSource).not.toContain('sync-lobehub-icons')
  })
})
