import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'
import router from './router'
import App from './App.vue'
import 'uno.css'
import './style.css'

const originalFetch = window.fetch
window.fetch = async (...args) => {
  const response = await originalFetch(...args)
  if (response.status === 401) {
    localStorage.removeItem('openkb_session')
    localStorage.removeItem('openkb_token')
    if (!window.location.pathname.startsWith('/auth/')) {
      window.location.href = '/auth/login'
    }
  }
  return response
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(naive)
app.mount('#app')
