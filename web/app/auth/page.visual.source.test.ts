import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8')

describe('登录页视觉与文案契约', () => {
  it('使用扁平布局和正确比例的横版品牌图', () => {
    expect(pageSource).toContain('showBackground={false}')
    expect(pageSource).toContain('src={BRAND_CONFIG.wordmarkSrc}')
    expect(pageSource).toContain('width={300}')
    expect(pageSource).toContain('height={80}')
    expect(pageSource).not.toMatch(/rounded-(?:xl|2xl|3xl|full)/)
    expect(pageSource).not.toContain('shadow-')
    expect(pageSource).not.toContain('backdrop-blur')
    expect(pageSource).not.toContain('gradient')
    expect(pageSource).not.toContain('bg-[#')
  })

  it('不向用户展示英文登录状态和部署排障术语', () => {
    expect(pageSource).not.toContain('Continue with')
    expect(pageSource).not.toContain('Signing in')
    expect(pageSource).not.toContain('SSO login failed')
    expect(pageSource).not.toContain('Bootstrap Token（可选）')
    expect(pageSource).not.toContain('首次 owner')
    expect(pageSource).not.toContain('INITIAL_ADMIN')
    expect(pageSource).not.toContain('Docker')
    expect(pageSource).not.toContain('bootstrap smoke')
    expect(pageSource).not.toContain('下一代')
  })
})
