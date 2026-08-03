import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readComponent = (fileName: string) =>
  readFileSync(resolve(__dirname, fileName), 'utf8')

describe('共享容器视觉契约', () => {
  it.each(['card.tsx', 'panel.tsx', 'stats-card.tsx'])(
    '%s 保持扁平、紧凑且无装饰性效果',
    (fileName) => {
      const source = readComponent(fileName)

      expect(source).not.toContain('linear-gradient')
      expect(source).not.toContain('backdrop-blur')
      expect(source).not.toContain('rounded-xl')
      expect(source).not.toContain('rounded-2xl')
      expect(source).not.toContain('shadow-soft')
      expect(source).not.toContain('hover:scale')
    }
  )
})
