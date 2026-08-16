import type { Knex } from 'knex'

/**
 * Move MCP permission from the agent identity to the bearer token:
 * - api_tokens gains permission_level (read/propose/write, default propose)
 * - agents loses permission_level (agent names become identity labels only)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_tokens', (table) => {
    table.string('permission_level').notNullable().defaultTo('propose')
  })
  await knex.schema.alterTable('agents', (table) => {
    table.dropColumn('permission_level')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('agents', (table) => {
    table.string('permission_level').notNullable().defaultTo('propose')
  })
  await knex.schema.alterTable('api_tokens', (table) => {
    table.dropColumn('permission_level')
  })
}
