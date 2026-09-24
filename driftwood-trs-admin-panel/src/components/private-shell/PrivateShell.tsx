import { AppShell, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { PrivateShellHeader } from './PrivateShellHeader'
import { PrivateShellNavbar, type PrivateNavItem } from './PrivateShellNavbar'

const NAVBAR_EXPANDED_WIDTH = 260
const NAVBAR_COLLAPSED_WIDTH = 72

interface PrivateShellProps {
  children: ReactNode
  displayName: string
  isLogoutError: boolean
  isLoggingOut: boolean
  logoutErrorMessage: string | undefined
  navItems: PrivateNavItem[]
  onLogout: () => void
}

function PrivateShell({
  children,
  displayName,
  isLogoutError,
  isLoggingOut,
  logoutErrorMessage,
  navItems,
  onLogout,
}: PrivateShellProps) {
  const activePathname = useRouterState({ select: (state) => state.location.pathname })
  const [navbarExpanded, { toggle: toggleNavbar }] = useDisclosure(true)

  return (
    <AppShell
      header={{ height: 64 }}
      navbar={{
        width: navbarExpanded ? NAVBAR_EXPANDED_WIDTH : NAVBAR_COLLAPSED_WIDTH,
        breakpoint: 'sm',
        collapsed: { mobile: false },
      }}
      padding="md"
    >
      <AppShell.Header px="md">
        <PrivateShellHeader
          displayName={displayName}
          navbarExpanded={navbarExpanded}
          onToggleNavbar={toggleNavbar}
        />
      </AppShell.Header>

      <PrivateShellNavbar
        activePathname={activePathname}
        isLogoutError={isLogoutError}
        isLoggingOut={isLoggingOut}
        navItems={navItems}
        navbarExpanded={navbarExpanded}
        onLogout={onLogout}
      />

      <AppShell.Main>
        {logoutErrorMessage ? (
          <Text c="red" size="sm" mb="md">
            {logoutErrorMessage}
          </Text>
        ) : null}
        {children}
      </AppShell.Main>
    </AppShell>
  )
}

export { PrivateShell }
export type { PrivateNavItem }
