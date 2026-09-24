import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { AppRouterProvider } from './common/contexts'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Root element #root was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <MantineProvider>
      <AppRouterProvider />
    </MantineProvider>
  </StrictMode>,
)
