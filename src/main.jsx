import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { GymProvider } from './context/GymContext.jsx'
import { UiProvider } from './context/UiContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GymProvider>
      <UiProvider>
        <App />
      </UiProvider>
    </GymProvider>
  </StrictMode>,
)
