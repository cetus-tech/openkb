import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import naive, { NConfigProvider } from 'naive-ui'
import RegisterView from '../src/views/RegisterView.vue'
import { useConfigStore } from '../src/stores/config'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

const router = createRouter({
  history: createMemoryHistory('/auth/register'),
  routes: [
    { path: '/auth/register', name: 'register', component: RegisterView },
    { path: '/dashboard', name: 'dashboard', component: { template: '<div>Dashboard</div>' } },
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/:pathMatch(.*)*', component: { template: '<div>Fallback</div>' } },
  ],
})

function factory() {
  const pinia = createPinia()
  const wrapper = mount(
    {
      components: { NConfigProvider, RegisterView },
      template: '<n-config-provider><RegisterView /></n-config-provider>',
    },
    {
      global: {
        plugins: [router, pinia, naive],
        stubs: {
          'router-link': true,
        },
      },
    }
  )
  const config = useConfigStore(pinia)
  config.signupEnabled = true
  return wrapper
}

describe('RegisterView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/auth/config') {
        return { ok: true, status: 200, json: async () => ({ signupEnabled: true }) }
      }
      return { ok: true, json: async () => ({}) }
    })
  })

  it('renders the registration form', async () => {
    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.text()).toContain('Create Account')
    expect(wrapper.text()).toContain('Already have an account?')
  })

  it('shows error when passwords do not match', async () => {
    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')
    const confirmInput = wrapper.findAll('input[type="password"]')[1]

    await emailInput.setValue('test@test.com')
    await passwordInput.setValue('password1')
    await confirmInput.setValue('password2')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Passwords do not match')
  })

  it('submits the form when passwords match', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/auth/config') {
        return { ok: true, status: 200, json: async () => ({ signupEnabled: true }) }
      }
      return {
        ok: true,
        json: async () => ({
          user: { email: 'test@test.com', role: 'owner' },
          session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
        }),
      }
    })
    localStorage.clear()

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')
    const confirmInput = wrapper.findAll('input[type="password"]')[1]

    await emailInput.setValue('test@test.com')
    await passwordInput.setValue('mypassword')
    await confirmInput.setValue('mypassword')
    await wrapper.find('form').trigger('submit.prevent')

    expect(mockFetch).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: 'test@test.com', password: 'mypassword' }),
    })
    expect(localStorage.getItem('openkb_session')).toBe('active')
    expect(localStorage.getItem('openkb_token')).toBeNull()
  })

  it('shows server error on registration failure', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/auth/config') {
        return { ok: true, status: 200, json: async () => ({ signupEnabled: true }) }
      }
      return {
        ok: false,
        json: async () => ({ message: 'Email already exists' }),
      }
    })

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')
    const confirmInput = wrapper.findAll('input[type="password"]')[1]

    await emailInput.setValue('existing@test.com')
    await passwordInput.setValue('password')
    await confirmInput.setValue('password')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Email already exists')
  })

  it('shows connection error when fetch throws', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === '/auth/config') {
        return { ok: true, status: 200, json: async () => ({ signupEnabled: true }) }
      }
      throw new Error('Network error')
    })

    const wrapper = factory()
    await new Promise((r) => setTimeout(r, 10))
    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')
    const confirmInput = wrapper.findAll('input[type="password"]')[1]

    await emailInput.setValue('test@test.com')
    await passwordInput.setValue('password')
    await confirmInput.setValue('password')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.text()).toContain('Failed to connect to server.')
  })
})
