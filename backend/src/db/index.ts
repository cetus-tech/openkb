import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import knex, { type Knex } from 'knex'
import type { OpenKbConfig } from '../config/index.js'

class ExtensionSwapMigrationSource {
  constructor(private directory: string) {}

  async getMigrations() {
    try {
      const files = await fs.readdir(this.directory)
      return files.filter((f) => !f.endsWith('.d.ts') && (f.endsWith('.js') || f.endsWith('.ts'))).sort()
    } catch (e: any) {
      if (e.code === 'ENOENT') return []
      throw e
    }
  }

  getMigrationName(migration: string) {
    return migration.replace(/\.ts$/, '.js')
  }

  async getMigration(migration: string) {
    const fullPath = path.join(this.directory, migration)
    return import(pathToFileURL(fullPath).href)
  }
}

/** OpenKB uses SQLite only (better-sqlite3). */
export function createKnex(config: OpenKbConfig): Knex {
  return knex({
    client: 'better-sqlite3',
    connection: { filename: config.sqliteFilename },
    useNullAsDefault: true,
    migrations: {
      migrationSource: new ExtensionSwapMigrationSource(path.join(import.meta.dirname, 'migrations')),
    },
  })
}

export const migrationPolicy =
  'Every DB schema change is a numbered SQLite migration under backend/src/db/migrations/ (new table = new migration).'
