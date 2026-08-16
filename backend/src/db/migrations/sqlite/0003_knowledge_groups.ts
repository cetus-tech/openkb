import type { Knex } from 'knex'

/**
 * Dashboard-only knowledge groups for organizing items in a tree.
 * Groups do not affect MCP search/retrieval.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('knowledge_groups', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable()
    table.integer('parent_id').unsigned().nullable()
    table.integer('sort_order').notNullable().defaultTo(0)
    table.string('created_at').notNullable()
    table.string('updated_at').notNullable()
    table.index(['parent_id', 'sort_order'])
  })

  await knex.schema.alterTable('knowledge', (table) => {
    table.integer('group_id').unsigned().nullable()
    table.index('group_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('knowledge', (table) => {
    table.dropColumn('group_id')
  })
  await knex.schema.dropTableIfExists('knowledge_groups')
}
