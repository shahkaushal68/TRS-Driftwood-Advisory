import { Box, Button, Group } from '@mantine/core'

interface ManualReviewActionFooterProps {
  onSaveDraft: () => void
  onMarkComplete: () => void
  /** True while a save (POST or PUT) is in flight — disables both buttons and shows a spinner
   *  on whichever action is pending isn't tracked separately, so both buttons share the flag. */
  isSaving?: boolean
}

/** Sticky bottom action bar for Manual Review mode. Backed by the real Manual Review API
 *  (POST on first save, PUT on every save after) — see AnalystDocumentDrawer/ManualReviewPanel. */
function ManualReviewActionFooter({
  onSaveDraft,
  onMarkComplete,
  isSaving = false,
}: ManualReviewActionFooterProps) {
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
      <Group justify="flex-end" gap="sm">
        <Button variant="default" size="sm" onClick={onSaveDraft} loading={isSaving}>
          Save Draft
        </Button>
        <Button color="blue" size="sm" onClick={onMarkComplete} loading={isSaving}>
          Mark Complete
        </Button>
      </Group>
    </Box>
  )
}

export { ManualReviewActionFooter }
