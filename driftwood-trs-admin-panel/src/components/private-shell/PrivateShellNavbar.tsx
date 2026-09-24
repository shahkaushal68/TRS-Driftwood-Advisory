import { AppShell, Button, NavLink, Stack, Tooltip } from '@mantine/core'
import { SignOutIcon } from '@phosphor-icons/react/SignOut'
import type { Icon } from '@phosphor-icons/react/lib'
import { Link as RouterLink } from '@tanstack/react-router'

type PrivateNavPath =
  | '/dashboard'
  | '/users'
  | '/documents'
  | '/trs-dashboard'
  | '/analyst/documents'
  | '/admin/ai-prompts'
  | '/admin/settings/ai-provider-config'

interface PrivateNavItem {
  icon: Icon
  label: string
  to: PrivateNavPath
}

interface PrivateShellNavbarProps {
  activePathname: string
  isLogoutError: boolean
  isLoggingOut: boolean
  navItems: PrivateNavItem[]
  navbarExpanded: boolean
  onLogout: () => void
}

function PrivateShellNavbar({
  activePathname,
  isLogoutError,
  isLoggingOut,
  navItems,
  navbarExpanded,
  onLogout,
}: PrivateShellNavbarProps) {
  return (
    <AppShell.Navbar p={navbarExpanded ? 'md' : 'xs'}>
      <AppShell.Section grow>
        <Stack gap="xs">
          {navItems.map((item) => (
            <PrivateShellNavLink
              key={item.to}
              active={activePathname === item.to || activePathname.startsWith(`${item.to}/`)}
              item={item}
              navbarExpanded={navbarExpanded}
            />
          ))}
        </Stack>
      </AppShell.Section>

      <AppShell.Section>
        <Tooltip label="Logout" disabled={navbarExpanded} position="right" withArrow>
          <Button
            fullWidth
            variant="light"
            color={isLogoutError ? 'red' : 'gray'}
            loading={isLoggingOut}
            {...(navbarExpanded ? { leftSection: <SignOutIcon size={20} /> } : { px: 0 })}
            onClick={onLogout}
            aria-label="Logout"
          >
            {navbarExpanded ? 'Logout' : <SignOutIcon size={20} />}
          </Button>
        </Tooltip>
      </AppShell.Section>
    </AppShell.Navbar>
  )
}

interface PrivateShellNavLinkProps {
  active: boolean
  item: PrivateNavItem
  navbarExpanded: boolean
}

function PrivateShellNavLink({ active, item, navbarExpanded }: PrivateShellNavLinkProps) {
  const Icon = item.icon

  return (
    <Tooltip label={item.label} disabled={navbarExpanded} position="right" withArrow>
      <NavLink
        active={active}
        component={RouterLink}
        label={navbarExpanded ? item.label : undefined}
        leftSection={<Icon size={20} />}
        to={item.to}
        variant="light"
        styles={{
          root: {
            justifyContent: navbarExpanded ? undefined : 'center',
          },
          section: {
            marginInlineEnd: navbarExpanded ? undefined : 0,
          },
        }}
        aria-label={item.label}
      />
    </Tooltip>
  )
}

export { PrivateShellNavbar }
export type { PrivateNavItem }
