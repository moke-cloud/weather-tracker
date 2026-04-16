import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// Request persistent storage so PWA data (headache diary, locations)
// won't be evicted by the browser under storage pressure.
if (navigator.storage?.persist) {
  navigator.storage.persist()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
