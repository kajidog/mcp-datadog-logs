import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Investigator } from './components/Investigator'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Investigator />
  </StrictMode>
)
