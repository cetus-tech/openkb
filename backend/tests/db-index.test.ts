import { describe, expect, it } from 'vitest'
import { migrationPolicy } from '../src/db/index.js'

describe('migrationPolicy', () => {
  it('requires separate sqlite and mysql migrations', () => {
    expect(migrationPolicy).toContain('SQLite')
    expect(migrationPolicy).toContain('MySQL')
  })
})
