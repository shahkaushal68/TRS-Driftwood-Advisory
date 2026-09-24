import {
  Alert,
  Button,
  Checkbox,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Controller, useForm, type SubmitHandler } from 'react-hook-form'
import type { SubmitEventHandler } from 'react'

import { authMutationOptions, authQueryKeys, authQueryOptions } from '../../common/api/auth'
import { getApiErrorMessage } from '../../common/api/client'
import { useUserStore } from '../../common/hooks/useUserStore'
import { Link } from '../../components/Link'

interface LoginFormValues {
  email: string
  password: string
  rememberMe: boolean
}

interface LoginSearch {
  redirect?: string
}

const getRedirectPath = (redirect: unknown) => {
  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect
  }

  return '/dashboard'
}

export const Route = createFileRoute('/_public/login')({
  validateSearch: (search): LoginSearch =>
    typeof search['redirect'] === 'string' ? { redirect: getRedirectPath(search['redirect']) } : {},
  component: Login,
})

function Login() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const redirect = Route.useSearch().redirect ?? '/dashboard'
  const loginMutation = useMutation({
    ...authMutationOptions.login(),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: authQueryKeys.all })
      const user = await queryClient.fetchQuery(authQueryOptions.profile())
      useUserStore.getState().setUser(user)
      router.history.replace(redirect)
    },
  })
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
    mode: 'onBlur',
  })

  const onSubmit: SubmitHandler<LoginFormValues> = (values) => {
    loginMutation.mutate(values)
  }

  const onFormSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    void handleSubmit(onSubmit)(event)
  }

  return (
    <>
      <Title ta="center" order={2}>
        Welcome back
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="xs">
        Sign in to Driftwood TRS admin panel
      </Text>

      <Paper withBorder shadow="md" p="xl" mt="xl" radius="sm">
        <form onSubmit={onFormSubmit} noValidate>
          <Stack>
            {loginMutation.isError ? (
              <Alert color="red" title="Unable to sign in">
                {getApiErrorMessage(loginMutation.error)}
              </Alert>
            ) : null}

            <Controller
              control={control}
              name="email"
              rules={{
                required: 'Email is required',
                pattern: {
                  value: /^\S+@\S+\.\S+$/,
                  message: 'Enter a valid email address',
                },
              }}
              render={({ field }) => (
                <TextInput
                  label="Email"
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  withAsterisk
                  value={field.value}
                  onChange={(event) => {
                    const email = event.currentTarget.value

                    field.onChange(email)
                  }}
                  onBlur={field.onBlur}
                  error={errors.email?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              rules={{
                required: 'Password is required',
                minLength: {
                  value: 8,
                  message: 'Password must be at least 8 characters',
                },
              }}
              render={({ field }) => (
                <PasswordInput
                  label="Password"
                  placeholder="Your password"
                  autoComplete="current-password"
                  withAsterisk
                  value={field.value}
                  onChange={(event) => {
                    const password = event.currentTarget.value

                    field.onChange(password)
                  }}
                  onBlur={field.onBlur}
                  error={errors.password?.message}
                  visibilityToggleButtonProps={{
                    'aria-label': 'Toggle password visibility',
                  }}
                />
              )}
            />

            <Group justify="space-between">
              <Controller
                control={control}
                name="rememberMe"
                render={({ field }) => (
                  <Checkbox
                    label="Remember me"
                    checked={field.value}
                    onChange={(event) => {
                      const rememberMe = event.currentTarget.checked

                      field.onChange(rememberMe)
                    }}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <Link to="/forgot-password" size="sm">
                Forgot password?
              </Link>
            </Group>

            <Button type="submit" fullWidth loading={loginMutation.isPending}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Paper>
    </>
  )
}
