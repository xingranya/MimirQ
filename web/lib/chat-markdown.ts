const INLINE_CODE_TOKEN_START = '\uE000chat-inline-code-'
const INLINE_CODE_TOKEN_END = '\uE001'

function normalizeProseSegment(segment: string): string {
  const inlineCodeSpans: string[] = []
  const protectedSegment = segment.replace(/(`+)([^\n]*?)\1/g, (match) => {
    const token = `${INLINE_CODE_TOKEN_START}${inlineCodeSpans.length}${INLINE_CODE_TOKEN_END}`
    inlineCodeSpans.push(match)
    return token
  })

  const boldTitle = '\\*\\*[^*\\n]{1,72}\\*\\*[：:]'
  let normalized = protectedSegment
    .replace(/^(#{1,6})([^\s#])/gm, '$1 $2')
    .replace(/^([ \t]*[-+*])(?=\*\*)/gm, '$1 ')
    .replace(
      new RegExp(`([。！？；：:!?;）\\]])[ \\t]*(\\d{1,2})[.．、][ \\t]*(?=${boldTitle})`, 'g'),
      '$1\n\n$2. '
    )
    .replace(
      new RegExp(`^([ \\t]*)(\\d{1,2})[.．、][ \\t]*(?=${boldTitle})`, 'gm'),
      '$1$2. '
    )
    .replace(/([。！？；）])[ \t]*(综上(?:所述)?|总结)([，,:：])/g, '$1\n\n$2$3')

  normalized = normalized.replace(
    new RegExp(`${INLINE_CODE_TOKEN_START}(\\d+)${INLINE_CODE_TOKEN_END}`, 'g'),
    (_match, index: string) => inlineCodeSpans[Number(index)] || ''
  )

  return normalized
}

/**
 * 修正常见的模型 Markdown 间距错误，同时保持代码块和行内代码原样。
 */
export function normalizeChatMarkdown(markdown: string): string {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n')
  const output: string[] = []
  let proseLines: string[] = []
  let fenceCharacter = ''
  let fenceLength = 0

  const flushProse = () => {
    if (!proseLines.length) return
    output.push(normalizeProseSegment(proseLines.join('\n')))
    proseLines = []
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/)
    if (!fenceCharacter && fenceMatch) {
      flushProse()
      fenceCharacter = fenceMatch[1][0]
      fenceLength = fenceMatch[1].length
      output.push(line)
      continue
    }

    if (fenceCharacter) {
      output.push(line)
      if (
        fenceMatch &&
        fenceMatch[1][0] === fenceCharacter &&
        fenceMatch[1].length >= fenceLength
      ) {
        fenceCharacter = ''
        fenceLength = 0
      }
      continue
    }

    proseLines.push(line)
  }

  flushProse()
  return output.join('\n')
}
