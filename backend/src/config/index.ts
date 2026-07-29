import { z } from 'zod'

export const dbClientSchema = z.enum(['sqlite', 'mysql'])
export type DbClient = z.infer<typeof dbClientSchema>

export const openKbConfigSchema = z.object({
  host: z.string().default('127.0.0.1'),
  port: z.coerce.number().int().positive().default(6800),
  dbClient: dbClientSchema.default('sqlite'),
  sqliteFilename: z.string().default('./data/openkb.db'),
  mysqlConnection: z.string().optional(),
  mysqlHost: z.string().default('127.0.0.1'),
  mysqlPort: z.coerce.number().int().positive().default(3306),
  mysqlUser: z.string().default('openkb'),
  mysqlPassword: z.string().default(''),
  mysqlDatabase: z.string().default('openkb'),
  dataDir: z.string().default('./data'),
})

export type OpenKbConfig = z.infer<typeof openKbConfigSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): OpenKbConfig {
  return openKbConfigSchema.parse({
    host: env.OPENKB_HOST,
    port: env.OPENKB_PORT,
    dbClient: env.OPENKB_DB_CLIENT,
    sqliteFilename: env.OPENKB_SQLITE_FILENAME,
    mysqlConnection: env.OPENKB_MYSQL_CONNECTION ?? env.DATABASE_URL,
    mysqlHost: env.OPENKB_MYSQL_HOST,
    mysqlPort: env.OPENKB_MYSQL_PORT,
    mysqlUser: env.OPENKB_MYSQL_USER,
    mysqlPassword: env.OPENKB_MYSQL_PASSWORD,
    mysqlDatabase: env.OPENKB_MYSQL_DATABASE ?? env.OPENKB_MYSQL_DB,
    dataDir: env.OPENKB_DATA_DIR,
  })
}
