import { Box, Group, Button } from '@mantine/core'

interface ReviewActionFooterProps {
  onSaveDraft: () => void
  onAccept: () => void
  onReject: () => void
  onMarkReviewComplete: () => void
}

/**
 * Sticky bottom action bar for the AI Review screen. All four actions are local-state
 * only (see AiReviewSection in AnalystDocumentDrawer.tsx) — no backend calls.
 * Visual hierarchy: Save Draft is the lowest-emphasis (default/neutral), Accept/Reject
 * are secondary (light, color-coded), Mark Review Complete is the primary/final action.
 */
function ReviewActionFooter({
  onSaveDraft,
  onAccept,
  onReject,
  onMarkReviewComplete,
}: ReviewActionFooterProps) {
  return (
    <Box
      style={(theme) => ({
        position: 'sticky',
        bottom: 0,
        background: theme.white,
        borderTop: `1px solid ${theme.colors.gray[3]}`,
        padding: theme.spacing.sm,
        margin: `${theme.spacing.md} calc(-1 * ${theme.spacing.md}) calc(-1 * ${theme.spacing.md})`,
        zIndex: 10,
      })}
    >
      <Group justify="flex-end" gap="sm" wrap="wrap">
        <Button variant="default" size="sm" onClick={onSaveDraft}>
          Save Draft
        </Button>
        <Button color="green" variant="light" size="sm" onClick={onAccept}>
          Accept AI Finding
        </Button>
        <Button color="red" variant="light" size="sm" onClick={onReject}>
          Reject AI Finding
        </Button>
        <Button color="blue" size="sm" onClick={onMarkReviewComplete}>
          Mark Review Complete
        </Button>
      </Group>
    </Box>
  )
}

export { ReviewActionFooter }
