import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AlertWindow } from './components/AlertWindow'
import './styles.css'

// La ventana de aviso carga esta misma interfaz con el hash #alert/<id>.
const alertId = /^#alert\/([\w-]+)$/.exec(window.location.hash)?.[1]

createRoot(document.getElementById('root')!).render(
  <StrictMode>{alertId ? <AlertWindow id={alertId} /> : <App />}</StrictMode>
)
