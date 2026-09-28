import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root.jsx'
import { getWebApp, setupGameWebApp } from './game/tg.js'
import { initWebApp } from './lib/telegram.js'

const wa = getWebApp()
if (wa) setupGameWebApp(wa)
else initWebApp() // світла/темна тема лендингу

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root wa={wa} />
  </StrictMode>,
)
