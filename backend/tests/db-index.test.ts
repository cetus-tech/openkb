import { describe, expect, it } from 'vitest'
import { migrationPolicy } from '../src/db/index.js'

describe('migrationPolicy', () => {
  it('describes SQLite-only numbered migrations', () => {
    expect(migrationPolicy).toContain('SQLite')
    expect(migrationPolicy).toContain('migrations')
    expect(migrationPolicy).not.toContain('MySQL')
  })
})
