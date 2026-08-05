import { describe, expect, it } from 'vitest'

import {
  URL_IMPORT_MAX_FILENAME_LENGTH,
  URL_IMPORT_MAX_URL_LENGTH,
  validateUrlImportAddress,
  validateUrlImportFilename,
} from './knowledge-url-import-dialog.validation'

describe('单个网址导入校验', () => {
  it('只接受 HTTP 和 HTTPS 地址', () => {
    expect(validateUrlImportAddress(' https://example.com/manual.pdf ')).toEqual({
      normalizedUrl: 'https://example.com/manual.pdf',
      error: null,
    })
    expect(validateUrlImportAddress('ftp://example.com/manual.pdf').error).toContain('http://')
    expect(validateUrlImportAddress('example.com/manual.pdf').error).toContain('完整网址')
  })

  it('拒绝超过后端边界的网址和文档名称', () => {
    expect(validateUrlImportAddress(`https://example.com/${'a'.repeat(URL_IMPORT_MAX_URL_LENGTH)}`).error).toContain(
      String(URL_IMPORT_MAX_URL_LENGTH)
    )
    expect(validateUrlImportFilename('a'.repeat(URL_IMPORT_MAX_FILENAME_LENGTH))).toBeNull()
    expect(validateUrlImportFilename('a'.repeat(URL_IMPORT_MAX_FILENAME_LENGTH + 1))).toContain(
      String(URL_IMPORT_MAX_FILENAME_LENGTH)
    )
  })
})
