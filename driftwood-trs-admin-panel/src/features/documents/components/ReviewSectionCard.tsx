import { ActionIcon, Group, Paper, Text, Textarea, Tooltip } from '@mantine/core'
import { CheckIcon } from '@phosphor-icons/react/Check'
import { PencilSimpleIcon } from '@phosphor-icons/react/PencilSimple'
import { useState } from 'react'

interface ReviewSectionCardProps {
  title: string
  value: string
  onChange: (value: string) => void
  minRows?: number
  placeholder?: string
}

/**
 * One editable AI Review section: a title, an Edit toggle, and either a read-only
 * (whitespace-preserving) display or a plain multiline textarea while editing. No
 * markdown rendering, per the ticket — this is intentionally the simplest possible card.
 */
function ReviewSectionCard({ title, value, onChange, minRows = 3, placeholder }: ReviewSectionCardProps) {
  const [isEditing, setIsEditing] = useState(false)

  return (
    <Paper withBorder radius="sm" p="md">
      <Group justify="space-between" align="center" mb="xs">
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Tooltip label={isEditing ? 'Done editing' : 'Edit'}>
          <ActionIcon
            variant={isEditing ? 'filled' : 'subtle'}
            color={isEditing ? 'blue' : 'gray'}
            size="sm"
            onClick={() => {
              setIsEditing((prev) => !prev)
            }}
          >
            {isEditing ? <CheckIcon size={14} /> : <PencilSimpleIcon size={14} />}
          </ActionIcon>
        </Tooltip>
      </Group>

      {isEditing ? (
        <Textarea
          value={value}
          onChange={(event) => {
            onChange(event.currentTarget.value)
          }}
          placeholder={placeholder}
          autosize
          minRows={minRows}
          size="sm"
          autoFocus
        />
      ) : (
        <Text
          size="sm"
          style={{ whiteSpace: 'pre-wrap' }}
          {...(value.trim().length === 0 ? { c: 'dimmed' } : {})}
        >
          {value.trim().length > 0 ? value : 'No content yet.'}
        </Text>
      )}
    </Paper>
  )
}

export { ReviewSectionCard }
