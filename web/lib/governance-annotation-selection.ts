export type GovernanceTextSelection = {
  start: number
  end: number
  text: string
}

/** 将连续空白压缩为单个空格，便于匹配浏览器复制出的选中文本。 */
export function normalizeGovernanceSelectedText(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function buildNormalizedTextIndex(source: string): {
  text: string
  originalOffsets: number[]
} {
  let text = ''
  let pendingWhitespaceOffset: number | null = null
  const originalOffsets: number[] = []

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (/\s/.test(character)) {
      if (text && pendingWhitespaceOffset === null) pendingWhitespaceOffset = index
      continue
    }

    if (pendingWhitespaceOffset !== null && text) {
      text += ' '
      originalOffsets.push(pendingWhitespaceOffset)
    }
    pendingWhitespaceOffset = null
    text += character
    originalOffsets.push(index)
  }

  return { text, originalOffsets }
}

/**
 * 将浏览器选中的文本映射回原始文档偏移。
 * 浏览器会压缩换行和连续空格，因此回退匹配必须保留规范化文本到原文的索引关系。
 */
export function findGovernanceSelectionRange(
  content: string,
  selectedText: string
): GovernanceTextSelection | null {
  const text = String(selectedText || '').trim()
  if (!content || !text) return null

  const exactStart = content.indexOf(text)
  if (exactStart >= 0) {
    return { start: exactStart, end: exactStart + text.length, text }
  }

  const normalizedSelection = normalizeGovernanceSelectedText(text)
  const normalizedContent = buildNormalizedTextIndex(content)
  const normalizedStart = normalizedContent.text.indexOf(normalizedSelection)
  if (normalizedStart < 0) return null

  const originalStart = normalizedContent.originalOffsets[normalizedStart]
  const originalLast = normalizedContent.originalOffsets[
    normalizedStart + normalizedSelection.length - 1
  ]
  if (originalStart === undefined || originalLast === undefined) return null

  const end = originalLast + 1
  return {
    start: originalStart,
    end,
    text: content.slice(originalStart, end),
  }
}
