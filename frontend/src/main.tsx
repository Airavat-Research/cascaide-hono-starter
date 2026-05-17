import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WavyBackground } from './components/ui/wavy-background.tsx'


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WavyBackground backgroundFill="white" blur={2}>
    <App />
    </WavyBackground>
  </StrictMode>,
)
