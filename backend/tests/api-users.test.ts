import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import sensible from '@fastify/sensible'
import { createKnex } from '../src/db/index.js'
import { registerAuthRoutes } from '../src/api/auth.js'
import { v1AuthHook } from '../src/api/auth.js'

async function testApp() {
  const dir = await mkdtemp(join(tmpdir(), 'openkb-users-'))
  const db = createKnex({
    host: '127.0.0.1',
    port: 6800,
    dbClient: 'sqlite',
    sqliteFilename: join(dir, 'openkb.db'),
    dataDir: dir,
  })
  await db.migrate.latest()
  const app = Fastify()
  await app.register(sensible)
  app.addHook('preHandler', v1AuthHook(db))
  registerAuthRoutes(app, db)
  await app.ready()
  return { app, db, dir }
}

function cookie(response: { headers: Record<string, unknown> }) {
  const header = response.headers['set-cookie']
  const value = Array.isArray(header) ? header[0] : header
  return String(value).split(';', 1)[0]
}

describe('user management API', () => {
  let app: Awaited<ReturnType<typeof testApp>>['app']
  let db: Awaited<ReturnType<typeof testApp>>['db']
  let dir: string
  let ownerCookie: string

  beforeEach(async () => {
    const ctx = await testApp()
    app = ctx.app
    db = ctx.db
    dir = ctx.dir
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'owner@test.com', password: 'secret1' },
    })
    expect(reg.statusCode).toBe(201)
    ownerCookie = cookie(reg)
  })

  afterEach(async () => {
    await app.close()
    await db.destroy()
    await rm(dir, { recursive: true, force: true })
  })

  it('lists users for signed-in accounts', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/users', headers: { cookie: ownerCookie } })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.users).toHaveLength(1)
    expect(body.users[0].email).toBe('owner@test.com')
    expect(body.users[0].role).toBe('owner')
    expect(body.currentUserId).toBe(body.users[0].id)
  })

  it('allows owner to create a member user', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/users',
      headers: { cookie: ownerCookie },
      payload: { email: 'member@test.com', password: 'secret2', role: 'member' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().user.email).toBe('member@test.com')
    expect(created.json().user.role).toBe('member')

    const list = await app.inject({ method: 'GET', url: '/v1/users', headers: { cookie: ownerCookie } })
    expect(list.json().users).toHaveLength(2)
  })

  it('forbids members from creating users', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/users',
      headers: { cookie: ownerCookie },
      payload: { email: 'member@test.com', password: 'secret2', role: 'member' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'member@test.com', password: 'secret2' },
    })
    const memberCookie = cookie(login)
    const denied = await app.inject({
      method: 'POST',
      url: '/v1/users',
      headers: { cookie: memberCookie },
      payload: { email: 'other@test.com', password: 'secret3' },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('prevents deleting the last owner and self', async () => {
    const list = await app.inject({ method: 'GET', url: '/v1/users', headers: { cookie: ownerCookie } })
    const ownerId = list.json().users[0].id
    const selfDelete = await app.inject({
      method: 'DELETE',
      url: `/v1/users/${ownerId}`,
      headers: { cookie: ownerCookie },
    })
    expect(selfDelete.statusCode).toBe(400)
  })

  it('owner can create admin users; admins manage non-owner users', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/users',
      headers: { cookie: ownerCookie },
      payload: { email: 'admin@test.com', password: 'secret2', role: 'admin' },
    })
    expect(created.statusCode).toBe(201)
    expect(created.json().user.role).toBe('admin')

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@test.com', password: 'secret2' },
    })
    const adminCookie = cookie(login)

    // Admin can create member users.
    const createMember = await app.inject({
      method: 'POST',
      url: '/v1/users',
      headers: { cookie: adminCookie },
      payload: { email: 'm2@test.com', password: 'secret3', role: 'member' },
    })
    expect(createMember.statusCode).toBe(201)
    expect(createMember.json().user.role).toBe('member')

    // Admin cannot create owner accounts.
    const createOwner = await app.inject({
      method: 'POST',
      url: '/v1/users',
      headers: { cookie: adminCookie },
      payload: { email: 'o2@test.com', password: 'secret3', role: 'owner' },
    })
    expect(createOwner.statusCode).toBe(403)

    // Admin can promote a member to admin but not to owner.
    const targetId = createMember.json().user.id
    const promote = await app.inject({
      method: 'PATCH',
      url: `/v1/users/${targetId}`,
      headers: { cookie: adminCookie },
      payload: { role: 'admin' },
    })
    expect(promote.statusCode).toBe(200)
    expect(promote.json().user.role).toBe('admin')

    const promoteOwner = await app.inject({
      method: 'PATCH',
      url: `/v1/users/${targetId}`,
      headers: { cookie: adminCookie },
      payload: { role: 'owner' },
    })
    expect(promoteOwner.statusCode).toBe(403)

    // Admin cannot delete the owner; owner can delete an admin.
    const list = await app.inject({ method: 'GET', url: '/v1/users', headers: { cookie: adminCookie } })
    const ownerRow = list.json().users.find((u: { role: string }) => u.role === 'owner')
    const delOwner = await app.inject({
      method: 'DELETE',
      url: `/v1/users/${ownerRow.id}`,
      headers: { cookie: adminCookie },
    })
    expect(delOwner.statusCode).toBe(403)

    const delAdmin = await app.inject({
      method: 'DELETE',
      url: `/v1/users/${targetId}`,
      headers: { cookie: ownerCookie },
    })
    expect(delAdmin.statusCode).toBe(204)
  })
})
