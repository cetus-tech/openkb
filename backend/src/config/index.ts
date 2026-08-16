import { z } from 'zod'
import path from 'node:path'

export const openKbConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.coerce.number().int().positive().default(6800),
  sqliteFilename: z.string().default('openkb.db'),
  dataDir: z.string().default('./data'),
})

export type OpenKbConfig = z.infer<typeof openKbConfigSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OpenKbConfig {
  // Fail fast if someone still sets a non-SQLite client from older installs.
  const client = env.OPENKB_DB_CLIENT?.trim()
  if (client && client !== 'sqlite') {
    throw new Error(
      `Unsupported OPENKB_DB_CLIENT="${client}". OpenKB only supports SQLite; remove OPENKB_DB_CLIENT or set it to "sqlite".`,
    )
  }

  const config = openKbConfigSchema.parse({
    host: env.OPENKB_HOST,
    port: env.OPENKB_PORT,
    sqliteFilename: env.OPENKB_SQLITE_FILENAME,
    dataDir: env.OPENKB_DATA_DIR,
  })

  if (!path.isAbsolute(config.sqliteFilename)) {
    config.sqliteFilename = path.join(config.dataDir, config.sqliteFilename)
  }

  return config
}
