import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { routeTree } from '../../routeTree.gen'
import { authQueryOptions } from '../api/auth'
import { useUserStore } from '../hooks/useUserStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const AuthBootstrap = () => {
  const [isBootstrapped, setIsBootstrapped] = useState(false)

  useEffect(() => {
    let isMounted = true

    void queryClient
      .fetchQuery(authQueryOptions.profile())
      .then((user) => {
        if (isMounted) {
          useUserStore.getState().setUser(user)
        }
      })
      .catch(() => {
        if (isMounted) {
          useUserStore.getState().clearUser()
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsBootstrapped(true)
        }
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (!isBootstrapped) {
    return null
  }

  return <RouterProvider router={router} />
}

const AppRouterProvider = () => (
  <QueryClientProvider client={queryClient}>
    <AuthBootstrap />
  </QueryClientProvider>
)

export { AppRouterProvider }
