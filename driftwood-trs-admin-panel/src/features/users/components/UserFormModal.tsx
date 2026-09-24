import { Alert, Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { SubmitEventHandler } from 'react'

import { getApiErrorMessage } from '../../../common/api/client'
import type { ManagedUser, UserRole } from '../../../common/api/users'
import { isUserRole, roleLabels, userRoles } from '../../../common/auth/roles'

interface UserFormValues {
  email: string
  name: string
  role: UserRole
}

type UserFormErrors = Partial<Record<keyof UserFormValues, string>>

interface UserFormModalProps {
  error?: unknown
  initialUser?: ManagedUser | undefined
  isSubmitting: boolean
  mode: 'create' | 'edit'
  opened: boolean
  onClose: () => void
  onSubmit: (values: UserFormValues) => void
}

const roleOptions = userRoles.map((role) => ({
  label: roleLabels[role],
  value: role,
}))

const getDefaultValues = (user: ManagedUser | undefined): UserFormValues => ({
  email: user?.email ?? '',
  name: user?.name ?? '',
  role: user?.role ?? 'user',
})

function UserFormModal({
  error,
  initialUser,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
  opened,
}: UserFormModalProps) {
  const title = mode === 'create' ? 'Add user' : 'Edit user'

  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      {opened ? (
        <UserForm
          key={initialUser?.id ?? mode}
          error={error}
          initialUser={initialUser}
          isSubmitting={isSubmitting}
          mode={mode}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Modal>
  )
}

function UserForm({
  error,
  initialUser,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
}: Omit<UserFormModalProps, 'opened'>) {
  const [values, setValues] = useState<UserFormValues>(() => getDefaultValues(initialUser))
  const [errors, setErrors] = useState<UserFormErrors>({})
  const submitLabel = mode === 'create' ? 'Create user' : 'Update user'

  const validate = (nextValues: UserFormValues) => {
    const nextErrors: UserFormErrors = {}
    const name = nextValues.name.trim()
    const email = nextValues.email.trim()

    if (name.length === 0) {
      nextErrors.name = 'Name is required'
    }

    if (email.length === 0) {
      nextErrors.email = 'Email is required'
    } else if (!/^\S+@\S+\.\S+$/.test(email)) {
      nextErrors.email = 'Enter a valid email address'
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  const onFormSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()

    if (!validate(values)) {
      return
    }

    onSubmit({
      email: values.email.trim(),
      name: values.name.trim(),
      role: values.role,
    })
  }

  return (
    <form onSubmit={onFormSubmit} noValidate>
      <Stack>
        {error === undefined || error === null ? null : (
          <Alert color="red" title="Unable to save user">
            {getApiErrorMessage(error)}
          </Alert>
        )}

        <TextInput
          label="Name"
          placeholder="Jane Smith"
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
          placeholder="jane@example.com"
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

        <Select
          label="Role"
          data={roleOptions}
          value={values.role}
          onChange={(value) => {
            const role = value ?? undefined

            if (isUserRole(role)) {
              setValues((currentValues) => ({
                ...currentValues,
                role,
              }))
            }
          }}
          error={errors.role}
          withAsterisk
          allowDeselect={false}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export { UserFormModal }
export type { UserFormValues }
