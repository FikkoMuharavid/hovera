import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTauriBridge } from './utils/tauriBridge'
import { initPersistentStorage } from './utils/persistentStorage'

initTauriBridge();

// Restore user data from disk before components read localStorage.
initPersistentStorage().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
