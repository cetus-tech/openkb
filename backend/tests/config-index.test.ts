import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config/index.js'

describe('loadConfig', () => {
  it('defaults to sqlite', () => {
    expect(loadConfig({}).dbClient).toBe('sqlite')
  })

  it('loads mysql config from env', () => {
    const config = loadConfig({ OPENKB_DB_CLIENT: 'mysql', DATABASE_URL: 'mysql://u:p@localhost/db' })
    expect(config.dbClient).toBe('mysql')
    expect(config.mysqlConnection).toBe('mysql://u:p@localhost/db')
  })
})
