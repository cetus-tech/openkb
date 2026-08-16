import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/index.js'
import { join } from 'node:path'

describe('loadConfig', () => {
  it('defaults to SQLite under the data dir', () => {
    const config = loadConfig({})
    expect(config.sqliteFilename).toBe(join('./data', 'openkb.db'))
    expect(config.port).toBe(6800)
  })

  it('rejects non-SQLite OPENKB_DB_CLIENT values', () => {
    expect(() => loadConfig({ OPENKB_DB_CLIENT: 'mysql' })).toThrow(/only supports SQLite/)
  })

  it('accepts OPENKB_DB_CLIENT=sqlite for older compose files', () => {
    const config = loadConfig({
      OPENKB_DB_CLIENT: 'sqlite',
      OPENKB_DATA_DIR: '/data',
      OPENKB_SQLITE_FILENAME: 'app.db',
    })
    expect(config.sqliteFilename).toBe(join('/data', 'app.db'))
  })
})
