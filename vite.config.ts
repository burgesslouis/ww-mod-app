import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['lantern-logo.png', 'role-card-back.png'],
      manifest: {
        name: 'Wherewolf Moderator',
        short_name: 'Wherewolf',
        description: 'An offline moderator and rules editor for Wherewolf.',
        theme_color: '#171512',
        background_color: '#171512',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'lantern-logo.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,png,json}']
      }
    })
  ]
})
