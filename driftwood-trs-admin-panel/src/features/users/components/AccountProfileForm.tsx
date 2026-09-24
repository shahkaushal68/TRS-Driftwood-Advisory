import { Alert, Button, Group, PasswordInput, Stack, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { SubmitEventHandler } from 'react'

import type { ManagedUser, UpdateMeRequest } from '../../../common/api/users'
import { getPasswordStrengthError } from '../utils/passwordStrength'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'

interface AccountProfileFormValues {
  confirmPassword: string
  currentPassword: string
  email: string
  name: string
  newPassword: string
}

type AccountProfileFormErrors = Partial<Record<keyof AccountProfileFormValues, string>>

interface AccountProfileFormProps {
  error?: string | undefined
  isSubmitting: boolean
  onSubmit: (values: UpdateMeRequest) => void
  onDismissSuccess?: () => void
  profile: ManagedUser
  success?: string | undefined
}

function AccountProfileForm({
  error,
  isSubmitting,
  onDismissSuccess,
  onSubmit,
  profile,
  success,
}: AccountProfileFormProps) {
  const [values, setValues] = useState<AccountProfileFormValues>(() => ({
    confirmPassword: '',
    currentPassword: '',
    email: profile.email,
    name: profile.name,
    newPassword: '',
  }))
  const [errors, setErrors] = useState<AccountProfileFormErrors>({})

  const validate = (nextValues: AccountProfileFormValues) => {
    const nextErrors: AccountProfileFormErrors = {}
    const name = nextValues.name.trim()
    const email = nextValues.email.trim()
    const isChangingPassword =
      nextValues.currentPassword.length > 0 || nextValues.newPassword.length > 0

    if (name.length === 0) {
      nextErrors.name = 'Name is required'
    } else if (name.length < 2) {
      nextErrors.name = 'Name must be at least 2 characters'
    }

    if (email.length === 0) {
      nextErrors.email = 'Email is required'
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address'
    }

    if (isChangingPassword && nextValues.currentPassword.length === 0) {
      nextErrors.currentPassword = 'Current password is required to change password'
    }

    if (isChangingPassword) {
      const passwordStrengthError = getPasswordStrengthError(nextValues.newPassword)

      if (passwordStrengthError !== true) {
        nextErrors.newPassword = passwordStrengthError
      }
    }

    if (
      nextValues.newPassword.length > 0 &&
      nextValues.confirmPassword !== nextValues.newPassword
    ) {
      nextErrors.confirmPassword = 'Passwords must match'
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()

    if (!validate(values)) {
      return
    }

    const payload: UpdateMeRequest = {
      email: values.email.trim(),
      name: values.name.trim(),
    }

    if (values.currentPassword.length > 0 || values.newPassword.length > 0) {
      payload.currentPassword = values.currentPassword
      payload.newPassword = values.newPassword
    }

    onSubmit(payload)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack>
        {success ? (
          <Alert
            color="green"
            title="Profile updated"
            withCloseButton={onDismissSuccess !== undefined}
            {...(onDismissSuccess !== undefined ? { onClose: onDismissSuccess } : {})}
          >
            {success}
          </Alert>
        ) : null}

        {error ? (
          <Alert color="red" title="Unable to update profile">
            {error}
          </Alert>
        ) : null}

        <TextInput
          label="Name"
          placeholder="Jane Doe"
          autoComplete="name"
          withAsterisk
          value={values.name}
          onChange={(event) => {
            const name = event.currentTarget.value

            setValues((currentValues) => ({
              ...currentValues,
              name,
            }))
          }}
          error={errors.name}
        />

        <TextInput
          label="Email"
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          withAsterisk
          value={values.email}
          onChange={(event) => {
            const email = event.currentTarget.value

            setValues((currentValues) => ({
              ...currentValues,
              email,
            }))
          }}
          error={errors.email}
        />

        <PasswordInput
          label="Current password"
          placeholder="Required to change password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(event) => {
            const currentPassword = event.currentTarget.value

            setValues((currentValues) => ({
              ...currentValues,
              currentPassword,
            }))
          }}
          error={errors.currentPassword}
          visibilityToggleButtonProps={{
            'aria-label': 'Toggle current password visibility',
          }}
        />

        <PasswordInput
          label="New password"
          placeholder="Leave blank to keep current password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={(event) => {
            const newPassword = event.currentTarget.value

            setValues((currentValues) => ({
              ...currentValues,
              newPassword,
            }))
          }}
          error={errors.newPassword}
          visibilityToggleButtonProps={{
            'aria-label': 'Toggle new password visibility',
          }}
        />

        <PasswordStrengthMeter value={values.newPassword} />

        <PasswordInput
          label="Confirm new password"
          placeholder="Confirm new password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={(event) => {
            const confirmPassword = event.currentTarget.value

            setValues((currentValues) => ({
              ...currentValues,
              confirmPassword,
            }))
          }}
          error={errors.confirmPassword}
          visibilityToggleButtonProps={{
            'aria-label': 'Toggle confirm password visibility',
          }}
        />

        <Group justify="flex-end">
          <Button type="submit" loading={isSubmitting}>
            Save changes
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export { AccountProfileForm }
