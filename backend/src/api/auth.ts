import Fastify from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { createHash, randomBytes, scryptSync } from 'node:crypto'
import type { Knex } from 'knex'

// ── Helpers ──────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex')
}

function generateToken(): string {
  return `okb_${randomBytes(32).toString('hex')}`
}

function tokenPreview(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function now(): string {
  return new Date().toISOString()
}

async function insertId(db: Knex, table: string, row: Record<string, unknown>): Promise<number> {
  const result = await db(table).insert(row)
  return Number(Array.isArray(result) ? result[0] : result)
}

// ── Row types ────────────────────────────────────────────────────

interface UserRow {
  id: number
  email: string
  name: string
  password_hash: string
  password_salt: string
  role: string
  created_at: string
  updated_at: string
}

interface TokenRow {
  id: number
  name: string
  user_id?: number | null
  token_prefix?: string | null
  /** Full bearer secret; used for auth lookup and portal copy. */
  token_value?: string | null
  created_at: string
  last_used_at?: string | null
}

function publicToken(row: TokenRow) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix ?? (row.token_value ? tokenPreview(row.token_value) : 'okb_...'),
    value: row.token_value ?? null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    userId: row.user_id,
  }
}

interface SessionRow {
  id: number
  user_id: number
  token_hash: string
  created_at: string
  expires_at: string
  last_used_at?: string | null
}

interface UserRowSummary {
  id: number
  email: string
  name: string
  role: string
}

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() ?? ''
  return local || email
}

export interface AuthToken {
  id: number
  /** Owning human user; required for MCP and attribution. */
  userId: number
  userEmail: string
}

export interface AuthContext {
  method: 'token' | 'session'
  userId?: number
  token?: AuthToken
  sessionId?: number
}

export const SESSION_COOKIE_NAME = 'openkb_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function lookupAuthToken(db: Knex, authorization?: string): Promise<AuthToken | undefined> {
  if (!authorization?.startsWith('Bearer ')) return undefined
  const tokenValue = authorization.slice(7).trim()
  if (!tokenValue) return undefined
  const row = await db<TokenRow>('api_tokens').where({ token_value: tokenValue }).first()
  // Tokens must be owned by a user; orphan legacy tokens are rejected.
  if (!row?.user_id) return undefined
  const user = await db<UserRowSummary>('users').select('id', 'email', 'name', 'role').where({ id: row.user_id }).first()
  if (!user) return undefined
  void db<TokenRow>('api_tokens').where({ id: row.id }).update({ last_used_at: now() })
  return {
    id: row.id,
    userId: user.id,
    userEmail: user.email,
  }
}

function parseCookies(header?: string): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(header.split(';').flatMap((part) => {
    const separator = part.indexOf('=')
    if (separator < 0) return []
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!key) return []
    try {
      return [[key, decodeURIComponent(value)]]
    } catch {
      return [[key, value]]
    }
  }))
}

function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

function isSecureRequest(request: FastifyRequest): boolean {
  const forwardedProto = request.headers['x-forwarded-proto']
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto
  return request.protocol === 'https' || proto?.split(',')[0].trim() === 'https'
}

async function lookupSession(db: Knex, cookieHeader?: string): Promise<{ id: number; userId: number } | undefined> {
  const value = parseCookies(cookieHeader)[SESSION_COOKIE_NAME]
  if (!value) return undefined
  const row = await db<SessionRow>('user_sessions').where({ token_hash: hashSecret(value) }).first()
  if (!row) return undefined
  if (Date.parse(row.expires_at) <= Date.now()) {
    await db<SessionRow>('user_sessions').where({ id: row.id }).delete()
    return undefined
  }
  void db<SessionRow>('user_sessions').where({ id: row.id }).update({ last_used_at: now() })
  return { id: row.id, userId: row.user_id }
}

export async function lookupAuthContext(db: Knex, request: Pick<FastifyRequest, 'headers'>): Promise<AuthContext | undefined> {
  const token = await lookupAuthToken(db, request.headers.authorization)
  if (token) return { method: 'token', userId: token.userId, token }
  const session = await lookupSession(db, request.headers.cookie)
  if (session) return { method: 'session', userId: session.userId, sessionId: session.id }
  return undefined
}

async function findUser(db: Knex, userId: number): Promise<UserRowSummary | undefined> {
  return db<UserRowSummary>('users').select('id', 'email', 'name', 'role').where({ id: userId }).first()
}

async function createSession(db: Knex, userId: number): Promise<{ value: string; expiresAt: string }> {
  const value = `oks_${randomBytes(32).toString('hex')}`
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  await insertId(db, 'user_sessions', {
    user_id: userId,
    token_hash: hashSecret(value),
    created_at: now(),
    expires_at: expiresAt,
    last_used_at: null,
  })
  return { value, expiresAt }
}

// ── V1 Auth Middleware ───────────────────────────────────────────

export function v1AuthHook(db: Knex) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for public endpoints
    const url = request.url
    if (
      url === '/health' ||
      url === '/version' ||
      url.startsWith('/auth/') ||
      url.startsWith('/v1/docs') ||
      // Always exclude the static file catch-all (/*) routes so they're
      // matched only by the static file handler, not protected by auth.
      // Fastify routes the catch-all as part of the router, so we rely on
      // the fact that non-v1 requests have no v1 prefix.
      !url.startsWith('/v1') ||
      request.method === 'OPTIONS'
    ) {
      return
    }

    const authContext = await lookupAuthContext(db, request)
    if (!authContext) {
      return reply.unauthorized('Missing or invalid Authorization header')
    }
    ;(request as FastifyRequest & { authContext: AuthContext }).authContext = authContext
  }
}

// ── Auth Routes ──────────────────────────────────────────────────

export function registerAuthRoutes(app: ReturnType<typeof Fastify>, db: Knex) {
  // Public auth configuration
  app.get('/auth/config', async (request: FastifyRequest, reply: FastifyReply) => {
    let signupEnabled = process.env.SIGNUP_ENABLED !== 'false'
    if (!signupEnabled) {
      const userCountRes = await db('users').count('id as count').first()
      if (Number((userCountRes as any)?.count ?? 0) === 0) signupEnabled = true
    }
    const hidePortal = process.env.HIDE_PORTAL === 'true'
    return { signupEnabled, hidePortal }
  })

  // Email + password login creates a browser session. API/MCP tokens are created explicitly below.
  app.post('/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { email?: string; password?: string }
    if (!body.email || !body.password) return reply.badRequest('email and password are required')

    const user = await db<UserRow>('users').where({ email: body.email }).first()
    if (!user) return reply.unauthorized('Invalid email or password')

    const hash = hashPassword(body.password, user.password_salt)
    if (hash !== user.password_hash) return reply.unauthorized('Invalid email or password')

    const session = await createSession(db, user.id)
    reply.header('Set-Cookie', sessionCookie(session.value, SESSION_TTL_SECONDS, isSecureRequest(request)))

    return reply.code(201).send({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      session: { expiresAt: session.expiresAt },
    })
  })

  app.get('/auth/session', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await lookupAuthContext(db, request)
    if (!context?.userId) return reply.unauthorized('Not signed in')
    const user = await findUser(db, context.userId)
    if (!user) return reply.unauthorized('Not signed in')
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      method: context.method,
    }
  })

  app.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = await lookupSession(db, request.headers.cookie)
    if (session) await db<SessionRow>('user_sessions').where({ id: session.id }).delete()
    reply.header('Set-Cookie', sessionCookie('', 0, isSecureRequest(request)))
    return reply.code(204).send()
  })

  // Explicitly create an API/MCP bearer credential. Full value is stored in the DB and returned.
  app.post('/auth/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await lookupAuthContext(db, request)
    if (!context?.userId) return reply.unauthorized('Sign in before creating an API token')
    const user = await findUser(db, context.userId)
    if (!user) return reply.unauthorized('Sign in before creating an API token')
    const body = request.body as { name?: string; tokenName?: string }
    const name = String(body.name ?? body.tokenName ?? 'mcp-client').trim() || 'mcp-client'
    const plain = generateToken()
    const tokenId = await insertId(db, 'api_tokens', {
      user_id: user.id,
      name,
      token_prefix: tokenPreview(plain),
      token_value: plain,
      created_at: now(),
      last_used_at: null,
    })
    return reply.code(201).send({
      user: { id: user.id, email: user.email, role: user.role },
      token: publicToken({
        id: tokenId,
        name,
        user_id: user.id,
        token_prefix: tokenPreview(plain),
        token_value: plain,
        created_at: now(),
        last_used_at: null,
      }),
    })
  })

  // List API tokens owned by the signed-in user only (per-user ownership).
  // Full token values come from the database (not browser storage).
  app.get('/auth/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await lookupAuthContext(db, request)
    if (!context?.userId) return reply.unauthorized('Sign in before managing API tokens')
    const rows = await db<TokenRow>('api_tokens')
      .where({ user_id: context.userId })
      .orderBy('created_at', 'desc')
    return {
      tokens: rows.map((r) => publicToken(r)),
    }
  })

  // Rename an API token owned by the signed-in user.
  app.patch('/auth/tokens/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await lookupAuthContext(db, request)
    if (!context?.userId) return reply.unauthorized('Sign in before managing API tokens')
    const params = request.params as { id: string }
    const body = request.body as { name?: string }
    const name = String(body.name ?? '').trim()
    if (!name) return reply.badRequest('name is required')
    if (name.length > 80) return reply.badRequest('name must be at most 80 characters')
    const tokenId = Number(params.id)
    if (!Number.isFinite(tokenId)) return reply.badRequest('Invalid token id')
    const target = await db<TokenRow>('api_tokens').where({ id: tokenId, user_id: context.userId }).first()
    if (!target) return reply.notFound('Token not found')
    await db<TokenRow>('api_tokens').where({ id: tokenId, user_id: context.userId }).update({ name })
    return {
      token: publicToken({ ...target, name }),
    }
  })

  // Revoke an API token owned by the signed-in user only.
  app.delete('/auth/tokens/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = await lookupAuthContext(db, request)
    if (!context?.userId) return reply.unauthorized('Sign in before managing API tokens')
    const params = request.params as { id: string }
    const tokenId = Number(params.id)
    if (!Number.isFinite(tokenId)) return reply.badRequest('Invalid token id')
    const target = await db<TokenRow>('api_tokens').where({ id: tokenId }).first()
    if (!target || target.user_id !== context.userId) return reply.notFound('Token not found')
    const deleted = await db<TokenRow>('api_tokens').where({ id: tokenId, user_id: context.userId }).delete()
    if (!deleted) return reply.notFound('Token not found')
    return reply.code(204).send()
  })

  // Register a new user account. First user ever becomes owner (admin).
  app.post('/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { email?: string; password?: string; name?: string }
    if (!body.email || !body.password) return reply.badRequest('email and password are required')

    let signupEnabled = process.env.SIGNUP_ENABLED !== 'false'
    
    // First user becomes owner; subsequent users become members
    const userCountRow = await db<UserRow>('users').count('id as count').first()
    const userCount = Number((userCountRow as any)?.count ?? 0)
    
    if (userCount === 0) {
      signupEnabled = true
    }

    if (!signupEnabled) {
      return reply.badRequest('Signup is currently disabled.')
    }

    const email = String(body.email).trim().toLowerCase()
    const name = String(body.name ?? '').trim() || displayNameFromEmail(email)

    // Check email uniqueness
    const existing = await db<UserRow>('users').where({ email }).first()
    if (existing) return reply.conflict('A user with this email already exists')

    const role = userCount === 0 ? 'owner' : 'member'

    const salt = randomBytes(16).toString('hex')
    const timestamp = now()
    const userId = await insertId(db, 'users', {
      email,
      name,
      password_hash: hashPassword(body.password, salt),
      password_salt: salt,
      role,
      created_at: timestamp,
      updated_at: timestamp,
    })

    const session = await createSession(db, userId)
    reply.header('Set-Cookie', sessionCookie(session.value, SESSION_TTL_SECONDS, isSecureRequest(request)))

    return reply.code(201).send({
      user: { id: userId, email, name, role },
      session: { expiresAt: session.expiresAt },
    })
  })

  // ── User management (portal) ─────────────────────────────────────

  async function requireSignedInUser(request: FastifyRequest, reply: FastifyReply) {
    const context = await lookupAuthContext(db, request)
    if (!context?.userId) {
      reply.unauthorized('Sign in required')
      return undefined
    }
    const user = await findUser(db, context.userId)
    if (!user) {
      reply.unauthorized('Sign in required')
      return undefined
    }
    return { context, user }
  }

  async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
    const auth = await requireSignedInUser(request, reply)
    if (!auth) return undefined
    if (auth.user.role !== 'owner') {
      reply.forbidden('Owner role required')
      return undefined
    }
    return auth
  }


  function publicUser(row: Pick<UserRow, 'id' | 'email' | 'name' | 'role' | 'created_at' | 'updated_at'>) {
    return {
      id: row.id,
      email: row.email,
      name: row.name ?? '',
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  // List portal users (any signed-in user).
  app.get('/v1/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireSignedInUser(request, reply)
    if (!auth) return
    const rows = await db<UserRow>('users').select('id', 'email', 'name', 'role', 'created_at', 'updated_at').orderBy('created_at', 'asc')
    return {
      users: rows.map(publicUser),
      currentUserId: auth.user.id,
    }
  })

  // Create a user account (owner only). Does not start a session for the new user.
  app.post('/v1/users', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireOwner(request, reply)
    if (!auth) return
    const body = request.body as { email?: string; password?: string; role?: string; name?: string }
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const name = String(body.name ?? '').trim() || displayNameFromEmail(email)
    const role = body.role === 'owner' ? 'owner' : 'member'
    if (!email || !password) return reply.badRequest('email and password are required')
    if (password.length < 6) return reply.badRequest('password must be at least 6 characters')
    const existing = await db<UserRow>('users').where({ email }).first()
    if (existing) return reply.conflict('A user with this email already exists')
    const salt = randomBytes(16).toString('hex')
    const timestamp = now()
    const userId = await insertId(db, 'users', {
      email,
      name,
      password_hash: hashPassword(password, salt),
      password_salt: salt,
      role,
      created_at: timestamp,
      updated_at: timestamp,
    })
    const user = await db<UserRow>('users').where({ id: userId }).first()
    return reply.code(201).send({ user: publicUser(user!) })
  })

  // Update name, role, or password. Role changes require owner; self may edit own name/password.
  app.patch('/v1/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireSignedInUser(request, reply)
    if (!auth) return
    const params = request.params as { id: string }
    const targetId = Number(params.id)
    if (!Number.isFinite(targetId)) return reply.badRequest('Invalid user id')
    const target = await db<UserRow>('users').where({ id: targetId }).first()
    if (!target) return reply.notFound('User not found')

    const body = request.body as { role?: string; password?: string; name?: string }
    const updates: Partial<UserRow> = { updated_at: now() }
    const isSelf = auth.user.id === targetId
    const isOwner = auth.user.role === 'owner'

    if (body.name !== undefined) {
      if (!isSelf && !isOwner) return reply.forbidden('Cannot change another user\'s name')
      const name = String(body.name).trim()
      if (!name) return reply.badRequest('name cannot be empty')
      if (name.length > 120) return reply.badRequest('name must be at most 120 characters')
      updates.name = name
    }

    if (body.role !== undefined) {
      if (!isOwner) return reply.forbidden('Owner role required to change roles')
      if (body.role !== 'owner' && body.role !== 'member') return reply.badRequest('role must be "owner" or "member"')
      if (target.role === 'owner' && body.role !== 'owner') {
        const owners = Number((await db<UserRow>('users').where({ role: 'owner' }).count('id as count').first() as { count?: number | string })?.count ?? 0)
        if (owners <= 1) return reply.badRequest('Cannot demote the last owner')
      }
      updates.role = body.role
    }

    if (body.password !== undefined) {
      if (!isSelf && !isOwner) return reply.forbidden('Cannot change another user\'s password')
      const password = String(body.password)
      if (password.length < 6) return reply.badRequest('password must be at least 6 characters')
      const salt = randomBytes(16).toString('hex')
      updates.password_salt = salt
      updates.password_hash = hashPassword(password, salt)
    }

    if (Object.keys(updates).length === 1) return reply.badRequest('No changes provided')
    await db<UserRow>('users').where({ id: targetId }).update(updates)
    const user = await db<UserRow>('users').where({ id: targetId }).first()
    return { user: publicUser(user!) }
  })

  // Toggle signup enabled (Removed: now managed via docker environment)

  // Delete a user (owner only).
  app.delete('/v1/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireOwner(request, reply)
    if (!auth) return
    const params = request.params as { id: string }
    const targetId = Number(params.id)
    if (!Number.isFinite(targetId)) return reply.badRequest('Invalid user id')
    if (auth.user.id === targetId) return reply.badRequest('Cannot delete your own account')
    const target = await db<UserRow>('users').where({ id: targetId }).first()
    if (!target) return reply.notFound('User not found')
    if (target.role === 'owner') {
      const owners = Number((await db<UserRow>('users').where({ role: 'owner' }).count('id as count').first() as { count?: number | string })?.count ?? 0)
      if (owners <= 1) return reply.badRequest('Cannot delete the last owner')
    }
    // Sessions cascade; tokens are SET NULL user_id — remove tokens for this user.
    await db<TokenRow>('api_tokens').where({ user_id: targetId }).delete()
    await db<UserRow>('users').where({ id: targetId }).delete()
    return reply.code(204).send()
  })

  app.get('/v1/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireSignedInUser(request, reply)
    if (!auth) return
    let signupEnabled = process.env.SIGNUP_ENABLED !== 'false'
    if (!signupEnabled) {
      const userCountRes = await db('users').count('id as count').first()
      if (Number((userCountRes as any)?.count ?? 0) === 0) signupEnabled = true
    }
    return { ...auth.user, signup_enabled: signupEnabled }
  })

  return app
}
