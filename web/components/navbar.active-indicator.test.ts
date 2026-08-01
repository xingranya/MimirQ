// 这里只检查源码契约，交互行为由行为测试覆盖。
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('navbar active route indicator', () => {
  it('adds a stable primary rail indicator for active items', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'navbar.tsx'), 'utf8')
    expect(src).toContain("'bg-primary/10 font-medium text-primary before:bg-primary'")
    expect(src).toContain('before:w-0.5')
    expect(src).not.toContain('before:bg-[linear-gradient')
  })
})
