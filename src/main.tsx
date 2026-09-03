import React from 'react'
import ReactDOM from 'react-dom/client'
import { appUpdater } from './pwa/updates'
import App from './App'
import './styles.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) void appUpdater.start()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
