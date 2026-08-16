import type { Knex } from 'knex'
import { seedOpenkbMcpInstructions } from '../seeds/openkb-mcp-instructions.js'

/**
 * Baseline schema (full current production shape, integer autoincrement IDs)
 * plus default seed knowledge for MCP agent instructions.
 * Future changes should add 0002_… migrations rather than rewriting this file
 * on databases that have already applied it.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary()
    table.string('email').notNullable().unique()
    table.string('name').notNullable().defaultTo('')
    table.string('password_hash').notNullable()
    table.string('password_salt').notNullable()
    table.string('role').notNullable().defaultTo('owner')
    table.string('created_at').notNullable()
    table.string('updated_at').notNullable()
  })

  await knex.schema.createTable('api_tokens', (table) => {
    table.increments('id').primary()
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL')
    table.string('name').notNullable()
    table.string('token_prefix')
    table.text('token_value').notNullable().unique()
    table.string('created_at').notNullable()
    table.string('last_used_at')
  })

  await knex.schema.createTable('user_sessions', (table) => {
    table.increments('id').primary()
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.string('token_hash').notNullable().unique()
    table.string('created_at').notNullable()
    table.string('expires_at').notNullable()
    table.string('last_used_at')
  })

  await knex.schema.createTable('knowledge', (table) => {
    table.increments('id').primary()
    table.string('slug').notNullable().unique()
    table.string('title').notNullable()
    table.string('type').notNullable()
    table.string('status').notNullable().defaultTo('active')
    table.text('summary').notNullable()
    table.text('scope_json').notNullable()
    table.integer('current_version_id').unsigned()
    table.string('created_at').notNullable()
    table.string('updated_at').notNullable()
  })

  await knex.schema.createTable('knowledge_versions', (table) => {
    table.increments('id').primary()
    table.integer('knowledge_id').unsigned().notNullable().references('id').inTable('knowledge').onDelete('CASCADE')
    table.integer('version_number').notNullable()
    table.text('content_markdown').notNullable()
    table.string('content_hash').notNullable()
    table.text('change_summary')
    table.string('created_by')
    table.string('created_at').notNullable()
    table.unique(['knowledge_id', 'version_number'])
  })

  await knex.schema.createTable('change_proposals', (table) => {
    table.increments('id').primary()
    table.integer('knowledge_id').unsigned().references('id').inTable('knowledge').onDelete('CASCADE')
    table.string('proposed_slug', 128).notNullable().defaultTo('knowledge')
    table.string('proposed_type', 64).notNullable().defaultTo('context')
    table.text('scope_json').notNullable().defaultTo('{}')
    table.string('status').notNullable().defaultTo('open')
    table.string('title').notNullable()
    table.text('proposed_content_markdown').notNullable()
    table.text('summary').notNullable()
    table.string('created_by')
    table.string('created_at').notNullable()
    table.string('reviewed_by')
    table.string('reviewed_at')
  })

  await knex.schema.createTable('agents', (table) => {
    table.increments('id').primary()
    table.string('name').notNullable().unique()
    table.string('permission_level').notNullable().defaultTo('propose')
    table.string('label')
    table.string('last_seen_at')
    table.integer('last_token_id').unsigned().references('id').inTable('api_tokens').onDelete('SET NULL')
    table.string('created_at').notNullable()
    table.string('updated_at').notNullable()
  })

  await knex.schema.createTable('app_settings', (table) => {
    table.increments('id').primary()
    table.string('key').notNullable().unique()
    table.text('value').notNullable()
    table.string('updated_at').notNullable()
  })

  await seedOpenkbMcpInstructions(knex)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('app_settings')
  await knex.schema.dropTableIfExists('agents')
  await knex.schema.dropTableIfExists('change_proposals')
  await knex.schema.dropTableIfExists('knowledge_versions')
  await knex.schema.dropTableIfExists('knowledge')
  await knex.schema.dropTableIfExists('user_sessions')
  await knex.schema.dropTableIfExists('api_tokens')
  await knex.schema.dropTableIfExists('users')
}
