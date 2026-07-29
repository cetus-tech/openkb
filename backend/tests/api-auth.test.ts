import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import sensible from '@fastify/sensible'
import knex, { type Knex } from 'knex'
import { registerAuthRoutes, v1AuthHook } from '../src/api/auth.js'

// ── Helpers ────────────────────────────────────────────────────────

function createDb(): Knex {
  return knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    pool: { min: 1, max: 1 },
  })
}

function sessionCookie(response: { headers: Record<string, unknown> }): string {
  const header = response.headers['set-cookie']
  const value = Array.isArray(header) ? header[0] : header
  return String(value).split(';', 1)[0]
}

async function createSchema(db: Knex) {
  await db.schema.createTable('projects', (table) => {
    table.string('id').primary()
    table.string('slug').notNullable().unique()
    table.string('name').notNullable()
    table.string('created_at').notNullable()
    table.string('updated_at').notNullable()
  })
  await db.schema.createTable('users', (table) => {
    table.increments('id').primary()
    table.string('email').notNullable().unique()
    table.string('name').notNullable().defaultTo('')
    table.string('password_hash').notNullable()
    table.string('password_salt').notNullable()
    table.string('role').notNullable().defaultTo('owner')
    table.string('created_at').notNullable()
    table.string('updated_at').notNullable()
  })
  await db.schema.createTable('api_tokens', (table) => {
    table.increments('id').primary()
    table.integer('user_id').unsigned().references('id').inTable('users')
    table.string('name').notNullable()
    table.string('token_prefix')
    table.text('token_value').notNullable().unique()
    table.string('created_at').notNullable()
    table.string('last_used_at')
  })
  await db.schema.createTable('user_sessions', (table) => {
    table.increments('id').primary()
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
    table.string('token_hash').notNullable().unique()
    table.string('created_at').notNullable()
    table.string('expires_at').notNullable()
    table.string('last_used_at')
  })
  await db.schema.createTable('app_settings', (table) => {
    table.string('key').primary()
    table.text('value').notNullable()
    table.string('updated_at').notNullable()
  })
  await db('app_settings').insert({
    key: 'signup_enabled',
    value: 'true',
    updated_at: new Date().toISOString()
  })
}

// ── Tests ──────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  let db: Knex
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    db = createDb()
    await createSchema(db)
    app = Fastify()
    await app.register(sensible)
    // registerAuthRoutes returns the app with routes registered
    registerAuthRoutes(app, db)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await db.destroy()
  })

  it('creates the first user as owner with a browser session but no API token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'admin@test.com', password: 'secret123' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.user.email).toBe('admin@test.com')
    expect(body.user.role).toBe('owner')
    expect(body.token).toBeUndefined()
    expect(body.session.expiresAt).toBeTruthy()
    expect(String(res.headers['set-cookie'])).toContain('openkb_session=')

    const tokens = await db('api_tokens').select()
    expect(tokens).toHaveLength(0)
    expect(await db('user_sessions').count('* as count').first()).toMatchObject({ count: 1 })
  })

  it('creates subsequent users as member', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'member@test.com', password: 'abcdef' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.user.email).toBe('member@test.com')
    expect(body.user.role).toBe('member')
  })

  it('does not create an API token from a registration token name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'custom@test.com', password: 'p@ssw0rd', tokenName: 'my-app' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.token).toBeUndefined()
    expect(await db('api_tokens').select()).toHaveLength(0)
  })

  it('rejects duplicate email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'admin@test.com', password: 'another' },
    })
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body)
    expect(body.message).toMatch(/already exists/i)
  })

  it('rejects missing email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { password: 'secret' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects missing password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'nope@test.com' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects empty body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it('does not expose the legacy setup endpoint', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/setup',
      payload: { email: 'setup@test.com', password: 'hunter2' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /auth/login', () => {
  let db: Knex
  let app: ReturnType<typeof Fastify>

  beforeAll(async () => {
    db = createDb()
    await createSchema(db)
    app = Fastify()
    await app.register(sensible)
    registerAuthRoutes(app, db)
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await db.destroy()
  })

  it('logs in with valid credentials', async () => {
    // First register a user
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'login@test.com', password: 'mypassword' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'login@test.com', password: 'mypassword' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.user.email).toBe('login@test.com')
    expect(body.token).toBeUndefined()
    expect(body.session.expiresAt).toBeTruthy()
    expect(await db('api_tokens').select()).toHaveLength(0)

    const secondLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'login@test.com', password: 'mypassword' },
    })
    expect(secondLogin.statusCode).toBe(201)
    expect(await db('api_tokens').select()).toHaveLength(0)
    const loginUser = await db('users').where({ email: 'login@test.com' }).first()
    expect(await db('user_sessions').where({ user_id: loginUser.id }).select()).toHaveLength(3)
  })

  it('rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'login@test.com', password: 'wrong' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'unknown@test.com', password: 'whatever' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('API token lifecycle', () => {
  it('creates, lists, and revokes API tokens independently from browser sessions', async () => {
    const db = createDb()
    await createSchema(db)
    const app = Fastify()
    await app.register(sensible)
    registerAuthRoutes(app, db)
    await app.ready()

    const registration = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'tokens@test.com', password: 'x' },
    })
    const cookie = sessionCookie(registration)

    const creation = await app.inject({
      method: 'POST',
      url: '/auth/tokens',
      headers: { cookie },
      payload: { name: 'codex' },
    })
    expect(creation.statusCode).toBe(201)
    const created = JSON.parse(creation.body)
    expect(created.token.value).toMatch(/^okb_/)
    expect(created.token.name).toBe('codex')

    const sessionList = await app.inject({ method: 'GET', url: '/auth/tokens', headers: { cookie } })
    expect(sessionList.statusCode).toBe(200)
    const sessionBody = JSON.parse(sessionList.body)
    expect(sessionBody.tokens).toHaveLength(1)
    expect(sessionBody.tokens[0].name).toBe('codex')
    expect(sessionBody.tokens[0].tokenPrefix).toMatch(/^okb_[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/)
    expect(sessionBody.tokens[0].value).toBe(created.token.value)
    expect(sessionBody.tokens[0].current).toBeUndefined()

    const res = await app.inject({ method: 'GET', url: '/auth/tokens', headers: { authorization: `Bearer ${created.token.value}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.tokens.length).toBe(1)
    expect(body.tokens[0].name).toBe('codex')
    expect(body.tokens[0].value).toBe(created.token.value)
    expect(body.tokens[0].current).toBeUndefined()

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/auth/tokens/${created.token.id}`,
      headers: { cookie },
      payload: { name: 'codex-renamed' },
    })
    expect(renamed.statusCode).toBe(200)
    expect(JSON.parse(renamed.body).token.name).toBe('codex-renamed')
    const afterRename = await app.inject({ method: 'GET', url: '/auth/tokens', headers: { cookie } })
    expect(JSON.parse(afterRename.body).tokens[0].name).toBe('codex-renamed')

    const secondCreation = await app.inject({
      method: 'POST',
      url: '/auth/tokens',
      headers: { cookie },
      payload: { name: 'temporary' },
    })
    const secondToken = JSON.parse(secondCreation.body).token
    const revoke = await app.inject({ method: 'DELETE', url: `/auth/tokens/${secondToken.id}`, headers: { cookie } })
    expect(revoke.statusCode).toBe(204)
    const revokedToken = await app.inject({ method: 'GET', url: '/auth/tokens', headers: { authorization: `Bearer ${secondToken.value}` } })
    expect(revokedToken.statusCode).toBe(401)

    const logout = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } })
    expect(logout.statusCode).toBe(204)
    const afterLogout = await app.inject({ method: 'GET', url: '/auth/tokens', headers: { cookie } })
    expect(afterLogout.statusCode).toBe(401)
    const tokenStillWorks = await app.inject({ method: 'GET', url: '/auth/tokens', headers: { authorization: `Bearer ${created.token.value}` } })
    expect(tokenStillWorks.statusCode).toBe(200)

    await app.close()
    await db.destroy()
  })
})

describe('browser session authorization', () => {
  it('allows session cookies through protected v1 routes without a bearer token', async () => {
    const db = createDb()
    await createSchema(db)
    const app = Fastify()
    await app.register(sensible)
    app.addHook('preHandler', v1AuthHook(db))
    registerAuthRoutes(app, db)
    app.get('/v1/private', async (request) => ({ authenticated: Boolean((request as FastifyRequest & { authContext?: unknown }).authContext) }))
    await app.ready()

    const registration = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'session@test.com', password: 'password' },
    })
    const cookie = sessionCookie(registration)
    const sessionResponse = await app.inject({ method: 'GET', url: '/v1/private', headers: { cookie } })
    expect(sessionResponse.statusCode).toBe(200)
    expect(sessionResponse.json()).toEqual({ authenticated: true })

    const anonymousResponse = await app.inject({ method: 'GET', url: '/v1/private' })
    expect(anonymousResponse.statusCode).toBe(401)

    await app.close()
    await db.destroy()
  })
})
