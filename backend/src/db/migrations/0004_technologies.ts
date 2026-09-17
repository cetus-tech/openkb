import type { Knex } from 'knex'

// Initial catalog data only. Runtime normalization reads the managed tables.
const initialAliases: Record<string, string> = {
  php: 'language:php',
  typescript: 'language:typescript',
  ts: 'language:typescript',
  javascript: 'language:javascript',
  js: 'language:javascript',
  go: 'language:go',
  golang: 'language:go',
  'vue 3': 'framework:vue:3',
  vue3: 'framework:vue:3',
  'vue@3': 'framework:vue:3',
  'vue:3': 'framework:vue:3',
  'framework:vue:3': 'framework:vue:3',
  'codeigniter 4': 'framework:codeigniter:4',
  codeigniter4: 'framework:codeigniter:4',
  ci4: 'framework:codeigniter:4',
  'codeigniter:4': 'framework:codeigniter:4',
  'framework:codeigniter:4': 'framework:codeigniter:4',
  'wails 2': 'framework:wails:2',
  wails2: 'framework:wails:2',
  'wails:2': 'framework:wails:2',
  'framework:wails:2': 'framework:wails:2',
}

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('technologies', table => {
    table.string('facet').primary()
    table.string('label').notNullable()
  })
  await db.schema.createTable('technology_aliases', table => {
    table.string('alias').primary()
    table.string('facet').notNullable().references('facet').inTable('technologies').onDelete('CASCADE')
  })
  const labels: Record<string, string> = {
    'language:php': 'PHP', 'language:typescript': 'TypeScript', 'language:javascript': 'JavaScript',
    'language:go': 'Go', 'framework:vue:3': 'Vue 3', 'framework:codeigniter:4': 'CodeIgniter 4', 'framework:wails:2': 'Wails 2',
  }
  for (const [facet, label] of Object.entries(labels)) {
    await db('technologies').insert({ facet, label })
  }
  for (const [alias, facet] of Object.entries(initialAliases)) {
    if (alias !== facet) await db('technology_aliases').insert({ alias, facet })
  }
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTable('technology_aliases')
  await db.schema.dropTable('technologies')
}
