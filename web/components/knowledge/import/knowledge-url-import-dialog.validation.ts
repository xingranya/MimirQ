const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export const URL_IMPORT_MAX_URL_LENGTH = 2000
export const URL_IMPORT_MAX_FILENAME_LENGTH = 500

export type UrlImportValidation = {
  normalizedUrl: string | null
  error: string | null
}

export function validateUrlImportAddress(raw: string): UrlImportValidation {
  const value = raw.trim()
  if (!value) {
    return { normalizedUrl: null, error: '请输入文档网址' }
  }
  if (value.length > URL_IMPORT_MAX_URL_LENGTH) {
    return {
      normalizedUrl: null,
      error: `网址不能超过 ${URL_IMPORT_MAX_URL_LENGTH} 个字符`,
    }
  }

  try {
    const parsed = new URL(value)
    if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
      return { normalizedUrl: null, error: '网址需以 http:// 或 https:// 开头' }
    }
    return { normalizedUrl: parsed.toString(), error: null }
  } catch {
    return {
      normalizedUrl: null,
      error: '请输入完整网址，例如 https://example.com/manual.pdf',
    }
  }
}

export function validateUrlImportFilename(raw: string): string | null {
  if (raw.trim().length <= URL_IMPORT_MAX_FILENAME_LENGTH) return null
  return `文档名称不能超过 ${URL_IMPORT_MAX_FILENAME_LENGTH} 个字符`
}
