import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import TerminalStandalone from './TerminalStandalone'
import FilesStandalone from './FilesStandalone'
import './styles/global.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)
const hash = window.location.hash

if (hash === '#terminal') {
  root.render(
    <React.StrictMode>
      <TerminalStandalone />
    </React.StrictMode>
  )
} else if (hash === '#files') {
  root.render(
    <React.StrictMode>
      <FilesStandalone />
    </React.StrictMode>
  )
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
