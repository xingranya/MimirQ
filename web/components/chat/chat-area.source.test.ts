import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const chatAreaSource = readFileSync(resolve(__dirname, '../chat-area.tsx'), 'utf8')
const settingsSheetSource = readFileSync(resolve(__dirname, 'conversation-settings-sheet.tsx'), 'utf8')

describe('首页对话界面源码契约', () => {
  it('首屏只保留数据集范围、更多设置、输入框和发送操作', () => {
    expect(chatAreaSource).toContain('ConversationSettingsSheet')
    expect(chatAreaSource).toContain("t('selectDataset')")
    expect(chatAreaSource).toContain('id="chat-composer"')
    expect(chatAreaSource).toContain("t('send')")
    expect(chatAreaSource).not.toContain('top-[438px]')
    expect(chatAreaSource).not.toContain('backdrop-blur')
    expect(chatAreaSource).not.toContain('<Magnetic')
    expect(chatAreaSource).not.toContain('<ThemeCustomizer')
  })

  it('统一设置抽屉承载所有低频对话能力', () => {
    expect(settingsSheetSource).toContain("t('templateAndMode')")
    expect(settingsSheetSource).toContain("t('retrievalSettings')")
    expect(settingsSheetSource).toContain("t('memoryAndTrace')")
    expect(settingsSheetSource).toContain("t('outputFormat')")
    expect(settingsSheetSource).toContain("t('voiceMode')")
    expect(settingsSheetSource).toContain("t('deepReasoning')")
  })
})
