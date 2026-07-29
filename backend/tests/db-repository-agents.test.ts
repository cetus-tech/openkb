import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createKnex } from '../src/db/index.js'
import {
  registerOrUpdateAgent,
  lookupAgent,
  listAgents,
  updateAgentPermission,
  deleteAgent,
  deleteKnowledge,
  type UpsertKnowledgeInput} from '../src/db/db-access.js'

async function sqliteDb() {
  const dir = await mkdtemp(join(tmpdir(), 'openkb-db-'))
  const db = createKnex({
    host: '127.0.0.1',
    port: 6800,
    dbClient: 'sqlite',
    sqliteFilename: join(dir, 'openkb.db'),
    dataDir: dir})
  await db.migrate.latest()
  return { dir, db }
}

describe('db agents', () => {
  it('registers a new agent with default propose permission', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const { agent } = await registerOrUpdateAgent(db, { name: 'test-agent' })
      expect(agent.name).toBe('test-agent')
            expect(agent.permissionLevel).toBe('propose')
      expect(typeof agent.id).toBe('number')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('registers a new agent with custom permission', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const { agent } = await registerOrUpdateAgent(db, {
        name: 'write-agent',
        permissionLevel: 'write',
        label: 'Hermes instance',
      })
      expect(agent.permissionLevel).toBe('write')
      expect(agent.label).toBe('Hermes instance')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('updates last_seen and label on re-registration', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const { agent: first } = await registerOrUpdateAgent(db, { name: 'agent', label: 'initial' })
      const { agent: second } = await registerOrUpdateAgent(db, { name: 'agent', label: 'updated' })
      expect(second.id).toBe(first.id)
      expect(second.label).toBe('updated')
            expect(second.lastSeenAt).toBeDefined()
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('records last token used when tokenId is provided', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const now = new Date().toISOString()
      const [userId] = await db('users').insert({
        email: 'agent-token@test.com',
        password_hash: 'x',
        password_salt: 'y',
        role: 'owner',
        created_at: now,
        updated_at: now,
      })
      const plain = 'okb_aabbccdd11223344eeff00112233445566778899aabbccddeeff0011223344'
      const [tokenId] = await db('api_tokens').insert({
        user_id: userId,
        name: 'seed',
        token_prefix: `${plain.slice(0, 8)}...${plain.slice(-4)}`,
        token_value: plain,
        created_at: now,
        last_used_at: null,
      })
      const { agent } = await registerOrUpdateAgent(db, { name: 'with-token', tokenId: Number(tokenId) })
      expect(agent.lastTokenId).toBe(tokenId)
      expect(agent.lastTokenPrefix).toBe('okb_aabb...3344')
      expect(agent.lastTokenName).toBe('seed')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('lookupAgent finds agent by name only', async () => {
    const { dir, db } = await sqliteDb()
    try {
      await registerOrUpdateAgent(db, { name: 'find-me' })
      const found = await lookupAgent(db, 'find-me')
      expect(found).toBeDefined()
      expect(found!.name).toBe('find-me')
                 const notFound = await lookupAgent(db, 'missing')
      expect(notFound).toBeUndefined()
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('listAgents returns all agents sorted by last_seen desc', async () => {
    const { dir, db } = await sqliteDb()
    try {
      await registerOrUpdateAgent(db, { name: 'a' })
      await registerOrUpdateAgent(db, { name: 'b' })
      const agents = await listAgents(db)
      expect(agents.length).toBe(2)
      const names = agents.map((a) => a.name)
      expect(names).toContain('a')
      expect(names).toContain('b')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('updateAgentPermission changes permission level', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const { agent } = await registerOrUpdateAgent(db, { name: 'promotable' })
      expect(agent.permissionLevel).toBe('propose')

      const updated = await updateAgentPermission(db, agent.id, 'write')
      expect(updated).toBeDefined()
      expect(updated!.permissionLevel).toBe('write')

      const lookedUp = await lookupAgent(db, 'promotable')
      expect(lookedUp!.permissionLevel).toBe('write')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('deleteAgent removes the agent', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const { agent } = await registerOrUpdateAgent(db, { name: 'to-delete' })
      const deleted = await deleteAgent(db, agent.id)
      expect(deleted).toBe(true)
      const found = await lookupAgent(db, 'to-delete')
      expect(found).toBeUndefined()
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('updateAgentPermission on nonexistent agent returns undefined', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const result = await updateAgentPermission(db, 'nonexistent', 'write')
      expect(result).toBeUndefined()
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('deleteAgent on nonexistent agent returns false', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const result = await deleteAgent(db, 'nonexistent')
      expect(result).toBe(false)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('db deleteKnowledge', () => {
  it('deletes a knowledge by slug', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const { upsertKnowledge } = await import('../src/db/db-access.js')

      const doc = await upsertKnowledge(db, {
        slug: 'to-delete',
        title: 'Delete Me',
        summary: 'Will be deleted',
        type: 'context',
        content: 'Bye'})
      expect(doc).toBeDefined()

      const deleted = await deleteKnowledge(db, 'to-delete')
      expect(deleted).toBe(true)

      const found = await (await import('../src/db/db-access.js')).getKnowledge(db, 'to-delete')
      expect(found).toBeUndefined()
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns false for nonexistent doc', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const result = await deleteKnowledge(db, 'whatever')
      expect(result).toBe(false)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('db upsertKnowledge with createdBy', () => {
  it('records created_by in version row', async () => {
    const { dir, db } = await sqliteDb()
    try {
      const { upsertKnowledge } = await import('../src/db/db-access.js')


      const doc = await upsertKnowledge(db, {
        slug: 'tracked-doc',
        title: 'Tracked',
        summary: 'Has creator',
        type: 'context',
        content: 'Content here',
        createdBy: 'hermes-ken'})
      expect(doc).toBeDefined()
      expect(doc.version).toBe(1)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
