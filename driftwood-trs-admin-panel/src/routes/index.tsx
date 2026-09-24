import { createFileRoute, redirect } from '@tanstack/react-router'

import { useUserStore } from '../common/hooks/useUserStore'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (useUserStore.getState().user === null) {
      redirect({
        to: '/login',
        replace: true,
        throw: true,
      })
    }

    redirect({
      to: '/dashboard',
      replace: true,
      throw: true,
    })
  },
})
