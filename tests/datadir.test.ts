import { describe, expect, it } from 'vitest'
import { sanitizeDataDir } from '../src/main/core/datadir'

describe('sanitizeDataDir', () => {
  it('accepts a normal absolute path unchanged', () => {
    expect(sanitizeDataDir('C:\\MCS-Data')).toBe('C:\\MCS-Data')
    expect(sanitizeDataDir('D:\\Videos\\MCS')).toBe('D:\\Videos\\MCS')
    expect(sanitizeDataDir('C:\\データ\\動画スタジオ')).toBe('C:\\データ\\動画スタジオ')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeDataDir('  C:\\MCS-Data  ')).toBe('C:\\MCS-Data')
  })

  it('nests MCS-Data when a bare drive root is chosen', () => {
    // a root would scatter engine/models at the root AND fail the
    // uninstaller marker sanity check (>3 chars)
    expect(sanitizeDataDir('D:\\')).toBe('D:\\MCS-Data')
    expect(sanitizeDataDir('D:/')).toBe('D:\\MCS-Data')
    expect(sanitizeDataDir(' e:\\ ')).toBe('e:\\MCS-Data')
  })

  it('rejects non-strings and relative/UNC/driveless paths', () => {
    expect(sanitizeDataDir(undefined)).toBeNull()
    expect(sanitizeDataDir(123)).toBeNull()
    expect(sanitizeDataDir('')).toBeNull()
    expect(sanitizeDataDir('relative\\path')).toBeNull()
    expect(sanitizeDataDir('C:')).toBeNull() // no separator
    expect(sanitizeDataDir('\\\\server\\share')).toBeNull() // UNC unsupported
  })

  it('keeps forward-slash non-root paths as given (Windows APIs accept them)', () => {
    expect(sanitizeDataDir('D:/Videos/MCS')).toBe('D:/Videos/MCS')
  })
})
