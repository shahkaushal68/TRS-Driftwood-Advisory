import { Alert, Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Controller, useForm, type SubmitHandler } from 'react-hook-form'
import type { SubmitEventHandler } from 'react'

import { authMutationOptions } from '../../common/api/auth'
import { getApiErrorMessage } from '../../common/api/client'
import { Link } from '../../components/Link'

interface ForgotPasswordFormValues {
  email: string
}

export const Route = createFileRoute('/_public/forgot-password')({
  component: ForgotPassword,
})

function ForgotPassword() {
  const forgotPasswordMutation = useMutation(authMutationOptions.forgotPassword())
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    defaultValues: {
      email: '',
    },
    mode: 'onBlur',
  })

  const onSubmit: SubmitHandler<ForgotPasswordFormValues> = (values) => {
    forgotPasswordMutation.mutate({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }

  const onFormSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    void handleSubmit(onSubmit)(event)
  }

  return (
    <>
      <Title ta="center" order={2}>
        Forgot password
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="xs">
        Enter your email to receive reset instructions.
      </Text>

      <Paper withBorder shadow="md" p="xl" mt="xl" radius="sm">
        <form onSubmit={onFormSubmit} noValidate>
          <Stack>
            {forgotPasswordMutation.isSuccess ? (
              <Alert color="green" title="Check your email">
                If an account exists for this email, reset instructions have been sent.
              </Alert>
            ) : null}

            {forgotPasswordMutation.isError ? (
              <Alert color="red" title="Unable to send reset email">
                {getApiErrorMessage(forgotPasswordMutation.error)}
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

            <Button type="submit" fullWidth loading={forgotPasswordMutation.isPending}>
              Send reset email
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
