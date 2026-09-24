import { Stack, Text, Textarea } from '@mantine/core'

interface AnalystNotesSectionProps {
  value: string
  onChange: (value: string) => void
}

/** Optional free-text notes, separate from the AI-generated sections above. Local state only. */
function AnalystNotesSection({ value, onChange }: AnalystNotesSectionProps) {
  return (
    <Stack gap={4}>
      <Text fw={600} size="sm">
        Analyst Notes
      </Text>
      <Textarea
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value)
        }}
        placeholder="Optional notes for this review..."
        autosize
        minRows={4}
        size="sm"
      />
    </Stack>
  )
}

export { AnalystNotesSection }
