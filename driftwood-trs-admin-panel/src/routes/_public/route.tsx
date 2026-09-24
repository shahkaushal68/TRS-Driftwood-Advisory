import { Container } from '@mantine/core'
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

import { useUserStore } from '../../common/hooks/useUserStore'

export const Route = createFileRoute('/_public')({
  beforeLoad: () => {
    if (useUserStore.getState().user !== null) {
      redirect({
        to: '/dashboard',
        replace: true,
        throw: true,
      })
    }
  },
  component: PublicLayout,
})

function PublicLayout() {
  return (
    <Container size={460} py="xl">
      <Outlet />
    </Container>
  )
}
