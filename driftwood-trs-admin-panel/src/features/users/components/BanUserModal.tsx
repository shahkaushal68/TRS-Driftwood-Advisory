import { Alert, Button, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import type { SubmitEventHandler } from 'react'

import { getApiErrorMessage } from '../../../common/api/client'
import type { BanUserRequest, ManagedUser } from '../../../common/api/users'

interface BanFormValues {
  expiresIn: '' | number
  reason: string
}

type BanFormErrors = Partial<Record<keyof BanFormValues, string>>

interface BanUserModalProps {
  error?: unknown
  isSubmitting: boolean
  opened: boolean
  user: ManagedUser | null
  onClose: () => void
  onSubmit: (values: BanUserRequest) => void
}

function BanUserModal({ error, isSubmitting, onClose, onSubmit, opened, user }: BanUserModalProps) {
  return (
    <Modal opened={opened} onClose={onClose} title="Ban user">
      {opened && user !== null ? (
        <BanUserForm
          key={user.id}
          error={error}
          isSubmitting={isSubmitting}
          onCancel={onClose}
          onSubmit={onSubmit}
          user={user}
        />
      ) : null}
    </Modal>
  )
}

function BanUserForm({
  error,
  isSubmitting,
  onCancel,
  onSubmit,
  user,
}: {
  error?: unknown
  isSubmitting: boolean
  onCancel: () => void
  onSubmit: (values: BanUserRequest) => void
  user: ManagedUser
}) {
  const [values, setValues] = useState<BanFormValues>({
    expiresIn: '',
    reason: '',
  })
  const [errors, setErrors] = useState<BanFormErrors>({})

  const validate = (nextValues: BanFormValues) => {
    const nextErrors: BanFormErrors = {}

    if (nextValues.reason.length > 500) {
      nextErrors.reason = 'Reason must be 500 characters or fewer'
    }

    if (nextValues.expiresIn !== '' && nextValues.expiresIn <= 0) {
      nextErrors.expiresIn = 'Expiration must be greater than 0 seconds'
    }

    setErrors(nextErrors)

    return Object.keys(nextErrors).length === 0
  }

  const handleValidSubmit = () => {
    if (!validate(values)) {
      return
    }

    const payload: BanUserRequest = {}
    const reason = values.reason.trim()

    if (reason.length > 0) {
      payload.reason = reason
    }

    if (typeof values.expiresIn === 'number') {
      payload.expiresIn = values.expiresIn
    }

    onSubmit(payload)
  }

  const onFormSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()
    handleValidSubmit()
  }

  return (
    <form onSubmit={onFormSubmit} noValidate>
      <Stack>
        {error === undefined ? null : (
          <Alert color="red" title="Unable to ban user">
            {getApiErrorMessage(error)}
          </Alert>
        )}

        <Text size="sm" c="dimmed">
          Ban {user.email}. Leave expiration empty for the backend default.
        </Text>

        <TextInput
          label="Reason"
          placeholder="Optional reason"
          value={values.reason}
          onChange={(event) => {
            const reason = event.currentTarget.value

            setValues((currentValues) => ({
              ...currentValues,
              reason,
            }))
          }}
          error={errors.reason}
        />

        <NumberInput
          label="Expires in seconds"
          placeholder="Optional seconds"
          min={1}
          value={values.expiresIn}
          onChange={(value) => {
            setValues((currentValues) => ({
              ...currentValues,
              expiresIn: typeof value === 'number' ? value : '',
            }))
          }}
          error={errors.expiresIn}
        />

        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button color="orange" type="submit" loading={isSubmitting}>
            Ban user
          </Button>
        </Group>
      </Stack>
    </form>
  )
}

export { BanUserModal }
