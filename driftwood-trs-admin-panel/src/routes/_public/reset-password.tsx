import { Alert, Button, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Controller, useForm, useWatch, type SubmitHandler } from 'react-hook-form'
import type { SubmitEventHandler } from 'react'

import { authMutationOptions } from '../../common/api/auth'
import { getApiErrorMessage } from '../../common/api/client'
import { Link } from '../../components/Link'
import { PasswordStrengthMeter } from '../../features/users/components/PasswordStrengthMeter'
import { getPasswordStrengthError } from '../../features/users/utils/passwordStrength'

interface ResetPasswordFormValues {
  newPassword: string
  confirmPassword: string
}

interface ResetPasswordSearch {
  token: string
}

export const Route = createFileRoute('/_public/reset-password')({
  validateSearch: (search): ResetPasswordSearch => ({
    token: typeof search['token'] === 'string' ? search['token'] : '',
  }),
  component: ResetPassword,
})

function ResetPassword() {
  const navigate = Route.useNavigate()
  const { token } = Route.useSearch()
  const resetPasswordMutation = useMutation({
    ...authMutationOptions.resetPassword(),
    onSuccess: () => {
      void navigate({ to: '/login', replace: true })
    },
  })
  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  })

  const onSubmit: SubmitHandler<ResetPasswordFormValues> = (values) => {
    resetPasswordMutation.mutate({
      newPassword: values.newPassword,
      token,
    })
  }

  const onFormSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    void handleSubmit(onSubmit)(event)
  }
  const newPassword = useWatch<ResetPasswordFormValues, 'newPassword'>({
    control,
    name: 'newPassword',
  })

  return (
    <>
      <Title ta="center" order={2}>
        Reset password
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="xs">
        Choose a new password for your account.
      </Text>

      <Paper withBorder shadow="md" p="xl" mt="xl" radius="sm">
        <form onSubmit={onFormSubmit} noValidate>
          <Stack>
            {token.length === 0 ? (
              <Alert color="red" title="Invalid reset link">
                This reset link is missing a token. Request a new password reset email.
              </Alert>
            ) : null}

            {resetPasswordMutation.isError ? (
              <Alert color="red" title="Unable to reset password">
                {getApiErrorMessage(resetPasswordMutation.error)}
              </Alert>
            ) : null}

            <Controller
              control={control}
              name="newPassword"
              rules={{
                required: 'New password is required',
                validate: getPasswordStrengthError,
              }}
              render={({ field }) => (
                <PasswordInput
                  label="New password"
                  placeholder="Your new password"
                  autoComplete="new-password"
                  withAsterisk
                  value={field.value}
                  onChange={(event) => {
                    const newPassword = event.currentTarget.value

                    field.onChange(newPassword)
                  }}
                  onBlur={field.onBlur}
                  error={errors.newPassword?.message}
                  visibilityToggleButtonProps={{
                    'aria-label': 'Toggle new password visibility',
                  }}
                />
              )}
            />

            <PasswordStrengthMeter value={newPassword} />

            <Controller
              control={control}
              name="confirmPassword"
              rules={{
                required: 'Confirm your password',
                validate: (value) => value === getValues('newPassword') || 'Passwords must match',
              }}
              render={({ field }) => (
                <PasswordInput
                  label="Confirm password"
                  placeholder="Confirm your new password"
                  autoComplete="new-password"
                  withAsterisk
                  value={field.value}
                  onChange={(event) => {
                    const confirmPassword = event.currentTarget.value

                    field.onChange(confirmPassword)
                  }}
                  onBlur={field.onBlur}
                  error={errors.confirmPassword?.message}
                  visibilityToggleButtonProps={{
                    'aria-label': 'Toggle confirm password visibility',
                  }}
                />
              )}
            />

            <Button
              type="submit"
              fullWidth
              loading={resetPasswordMutation.isPending}
              disabled={token.length === 0}
            >
              Reset password
            </Button>

            <Text ta="center" size="sm">
              <Link to="/login">Back to login</Link>
            </Text>
          </Stack>
        </form>
      </Paper>
    </>
  )
}
