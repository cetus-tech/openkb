import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/api/app.js'
import { createKnex } from '../src/db/index.js'
import { createKnowledgeService } from '../src/core/service.js'
import { registerAuthRoutes, v1AuthHook } from '../src/api/auth.js'

async function testApp() {
  const dir = await mkdtemp(join(tmpdir(), 'openkb-authz-'))
  const db = createKnex({
    host: '127.0.0.1',
    port: 6800,
    dbClient: 'sqlite',
    sqliteFilename: join(dir, 'openkb.db'),
    dataDir: dir,
  })
  await db.migrate.latest()
  const app = buildApp(createKnowledgeService(db))
  app.addHook('preHandler', v1AuthHook(db))
  registerAuthRoutes(app, db)

  async function register(email: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'secret123' },
    })
    expect(res.statusCode).toBe(201)
    const setCookie = res.headers['set-cookie']
    const cookie = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';', 1)[0]
    return { cookie, headers: { cookie }, user: res.json().user as { id: number; email: string; role: string } }
  }

  async function createToken(cookie: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/tokens',
      headers: { cookie },
      payload: { name: 'authz-test' },
    })
    expect(res.statusCode).toBe(201)
    return String((res.json().token as { value: string }).value)
  }

  const owner = await register('owner@test.com')
  const member = await register('member@test.com')
  expect(member.user.role).toBe('member')
  const ownerToken = await createToken(owner.cookie)
  const memberToken = await createToken(member.cookie)
  return { app, db, dir, owner, member, ownerToken, memberToken }
}

describe('v1 authorization', () => {
  it('rejects unauthenticated requests to protected v1 endpoints', async () => {
    const { app, db, dir } = await testApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        payload: { slug: 'x', title: 'X', summary: 'X', content: 'X' },
      })
      expect(res.statusCode).toBe(401)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('allows members to read knowledge but not write or delete it', async () => {
    const { app, db, dir, owner, member, memberToken } = await testApp()
    try {
      const create = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: owner.headers,
        payload: { slug: 'authz-doc', title: 'Authz Doc', summary: 'S', type: 'rule', content: 'C' },
      })
      expect(create.statusCode).toBe(201)

      const read = await app.inject({ method: 'GET', url: '/v1/knowledge/authz-doc', headers: member.headers })
      expect(read.statusCode).toBe(200)

      const write = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: member.headers,
        payload: { slug: 'member-write', title: 'M', summary: 'M', content: 'M' },
      })
      expect(write.statusCode).toBe(403)

      const writeWithToken = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { slug: 'member-token-write', title: 'M', summary: 'M', content: 'M' },
      })
      expect(writeWithToken.statusCode).toBe(403)

      const del = await app.inject({ method: 'DELETE', url: '/v1/knowledge/authz-doc', headers: member.headers })
      expect(del.statusCode).toBe(403)

      const ownerDel = await app.inject({ method: 'DELETE', url: '/v1/knowledge/authz-doc', headers: owner.headers })
      expect(ownerDel.statusCode).toBe(204)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('restricts version deletion to owners', async () => {
    const { app, db, dir, owner, member } = await testApp()
    try {
      await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: owner.headers,
        payload: { slug: 'versions-doc', title: 'V', summary: 'V', content: 'v1' },
      })
      await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: owner.headers,
        payload: { slug: 'versions-doc', title: 'V', summary: 'V', content: 'v2' },
      })
      const history = await app.inject({ method: 'GET', url: '/v1/knowledge/versions-doc/versions', headers: owner.headers })
      const oldId = history.json().versions.find((v: { version: number }) => v.version === 1)?.id
      expect(oldId).toBeTruthy()

      const memberDel = await app.inject({ method: 'DELETE', url: `/v1/knowledge/versions-doc/versions/${oldId}`, headers: member.headers })
      expect(memberDel.statusCode).toBe(403)

      const ownerDel = await app.inject({ method: 'DELETE', url: `/v1/knowledge/versions-doc/versions/${oldId}`, headers: owner.headers })
      expect(ownerDel.statusCode).toBe(200)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('lets members propose and edit proposals but only owners decide status', async () => {
    const { app, db, dir, owner, member } = await testApp()
    try {
      const propose = await app.inject({
        method: 'POST',
        url: '/v1/proposals',
        headers: member.headers,
        payload: { title: 'Member Proposal', summary: 'S', content: 'C' },
      })
      expect(propose.statusCode).toBe(201)
      const proposalId = propose.json().proposal.id

      const edit = await app.inject({
        method: 'PATCH',
        url: `/v1/proposals/${proposalId}`,
        headers: member.headers,
        payload: { title: 'Member Proposal (edited)' },
      })
      expect(edit.statusCode).toBe(200)

      const approve = await app.inject({
        method: 'PATCH',
        url: `/v1/proposals/${proposalId}`,
        headers: member.headers,
        payload: { status: 'approved' },
      })
      expect(approve.statusCode).toBe(403)

      const reject = await app.inject({
        method: 'PATCH',
        url: `/v1/proposals/${proposalId}`,
        headers: member.headers,
        payload: { status: 'rejected' },
      })
      expect(reject.statusCode).toBe(403)

      const ownerApprove = await app.inject({
        method: 'PATCH',
        url: `/v1/proposals/${proposalId}`,
        headers: owner.headers,
        payload: { status: 'approved' },
      })
      expect(ownerApprove.statusCode).toBe(200)
      expect(ownerApprove.json().proposal.status).toBe('approved')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('restricts proposal deletion to owners', async () => {
    const { app, db, dir, owner, member } = await testApp()
    try {
      const propose = await app.inject({
        method: 'POST',
        url: '/v1/proposals',
        headers: owner.headers,
        payload: { title: 'Del Me', summary: 'S', content: 'C' },
      })
      const proposalId = propose.json().proposal.id
      await app.inject({
        method: 'PATCH',
        url: `/v1/proposals/${proposalId}`,
        headers: owner.headers,
        payload: { status: 'rejected' },
      })

      const memberDel = await app.inject({ method: 'DELETE', url: `/v1/proposals/${proposalId}`, headers: member.headers })
      expect(memberDel.statusCode).toBe(403)

      const ownerDel = await app.inject({ method: 'DELETE', url: `/v1/proposals/${proposalId}`, headers: owner.headers })
      expect(ownerDel.statusCode).toBe(204)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('restricts agent management to owners', async () => {
    const { app, db, dir, owner, member } = await testApp()
    try {
      const memberCreate = await app.inject({
        method: 'POST',
        url: '/v1/agents',
        headers: member.headers,
        payload: { name: 'ghost' },
      })
      expect(memberCreate.statusCode).toBe(403)

      const ownerCreate = await app.inject({
        method: 'POST',
        url: '/v1/agents',
        headers: owner.headers,
        payload: { name: 'trusted' },
      })
      expect(ownerCreate.statusCode).toBe(201)
      const agentId = ownerCreate.json().agent.id

      const memberDel = await app.inject({ method: 'DELETE', url: `/v1/agents/${agentId}`, headers: member.headers })
      expect(memberDel.statusCode).toBe(403)

      const ownerDel = await app.inject({ method: 'DELETE', url: `/v1/agents/${agentId}`, headers: owner.headers })
      expect(ownerDel.statusCode).toBe(204)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('caps token permissions for members and lets owners mint write tokens', async () => {
    const { app, db, dir, owner, member } = await testApp()
    try {
      const memberWrite = await app.inject({
        method: 'POST',
        url: '/auth/tokens',
        headers: member.headers,
        payload: { name: 'member-write', permissionLevel: 'write' },
      })
      expect(memberWrite.statusCode).toBe(403)

      const memberPropose = await app.inject({
        method: 'POST',
        url: '/auth/tokens',
        headers: member.headers,
        payload: { name: 'member-token', permissionLevel: 'propose' },
      })
      expect(memberPropose.statusCode).toBe(201)
      const memberTokenId = memberPropose.json().token.id
      expect(memberPropose.json().token.permissionLevel).toBe('propose')

      const memberUpgrade = await app.inject({
        method: 'PATCH',
        url: `/auth/tokens/${memberTokenId}`,
        headers: member.headers,
        payload: { permissionLevel: 'write' },
      })
      expect(memberUpgrade.statusCode).toBe(403)

      const memberDowngrade = await app.inject({
        method: 'PATCH',
        url: `/auth/tokens/${memberTokenId}`,
        headers: member.headers,
        payload: { permissionLevel: 'read' },
      })
      expect(memberDowngrade.statusCode).toBe(200)
      expect(memberDowngrade.json().token.permissionLevel).toBe('read')

      const ownerWrite = await app.inject({
        method: 'POST',
        url: '/auth/tokens',
        headers: owner.headers,
        payload: { name: 'owner-write', permissionLevel: 'write' },
      })
      expect(ownerWrite.statusCode).toBe(201)
      expect(ownerWrite.json().token.permissionLevel).toBe('write')

      const invalidLevel = await app.inject({
        method: 'POST',
        url: '/auth/tokens',
        headers: owner.headers,
        payload: { name: 'bad', permissionLevel: 'superuser' },
      })
      expect(invalidLevel.statusCode).toBe(400)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('restricts app settings access to owners', async () => {
    const { app, db, dir, owner, member } = await testApp()
    try {
      const memberGet = await app.inject({ method: 'GET', url: '/v1/settings/some_key', headers: member.headers })
      expect(memberGet.statusCode).toBe(403)

      const memberPut = await app.inject({
        method: 'PUT',
        url: '/v1/settings/some_key',
        headers: member.headers,
        payload: { value: 'x' },
      })
      expect(memberPut.statusCode).toBe(403)

      const ownerPut = await app.inject({
        method: 'PUT',
        url: '/v1/settings/some_key',
        headers: owner.headers,
        payload: { value: 'x' },
      })
      expect(ownerPut.statusCode).toBe(200)

      const ownerGet = await app.inject({ method: 'GET', url: '/v1/settings/some_key', headers: owner.headers })
      expect(ownerGet.statusCode).toBe(200)
      expect(ownerGet.json().value).toBe('x')
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('allows owner bearer tokens on the REST API', async () => {
    const { app, db, dir, ownerToken } = await testApp()
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/knowledge',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { slug: 'owner-token-doc', title: 'O', summary: 'O', content: 'O' },
      })
      expect(res.statusCode).toBe(201)
    } finally {
      await db.destroy()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
