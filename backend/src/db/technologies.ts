import type { Knex } from 'knex'
import { normalizeStackFacet } from '../core/index.js'

export interface Technology {
  facet: string
  label: string
  aliases: string[]
}

export class TechnologyValidationError extends Error {}

export async function listTechnologies(db: Knex): Promise<Technology[]> {
  const rows = await db('technologies').select('facet', 'label').orderBy('label')
  const aliases = await db('technology_aliases').select('facet', 'alias').orderBy('alias')
  return rows.map(row => ({ ...row, aliases: aliases.filter(item => item.facet === row.facet).map(item => item.alias) }))
}

export async function technologyAliases(db: Knex): Promise<Record<string, string>> {
  const rows = await db('technology_aliases').select('alias', 'facet')
  return Object.fromEntries(rows.map(row => [row.alias, row.facet]))
}

/** Canonical IDs never change: stored knowledge continues to reference the same technology. */
export async function saveTechnology(db: Knex, facet: string, input: { label?: unknown; aliases?: unknown }): Promise<Technology> {
  if (facet.length > 120 || normalizeStackFacet(facet) !== facet) {
    throw new TechnologyValidationError('Use a canonical ID: language:name or framework:name:major-version')
  }
  if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 100) {
    throw new TechnologyValidationError('A technology name of 1–100 characters is required')
  }
  if (!Array.isArray(input.aliases) || input.aliases.length > 50 || input.aliases.some(value => typeof value !== 'string' || !value.trim() || value.length > 100)) {
    throw new TechnologyValidationError('Aliases must be a list of up to 50 non-empty names (100 characters each)')
  }
  const label = input.label.trim()
  const aliases = [...new Set([label, ...input.aliases as string[]].map(value => value.trim().toLowerCase().replace(/\s+/g, ' ')))].filter(alias => alias !== facet)
  if (aliases.some(alias => /^(language|framework):/.test(alias))) {
    throw new TechnologyValidationError('Aliases cannot use the reserved language: or framework: prefixes')
  }
  return db.transaction(async trx => {
    const conflict = await trx('technology_aliases').whereIn('alias', aliases).whereNot('facet', facet).first()
    if (conflict) throw new TechnologyValidationError(`Name or alias "${conflict.alias}" already belongs to ${conflict.facet}`)
    await trx('technologies').insert({ facet, label }).onConflict('facet').merge({ label })
    await trx('technology_aliases').where({ facet }).delete()
    if (aliases.length) await trx('technology_aliases').insert(aliases.map(alias => ({ alias, facet })))
    return { facet, label, aliases }
  })
}
