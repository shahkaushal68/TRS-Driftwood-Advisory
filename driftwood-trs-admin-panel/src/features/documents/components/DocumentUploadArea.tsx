import { Alert, Box, Button, Group, Stack, Text } from '@mantine/core'
import { UploadSimpleIcon } from '@phosphor-icons/react/UploadSimple'
import { useRef, useState } from 'react'

import { apiClient, getApiErrorMessage } from '../../../common/api/client'
import type { IntakeDocument, RegisterDocumentRequest } from '../../../common/api/documents'
import { documentApi } from '../../../common/api/documents'

const ACCEPTED_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
}

const ACCEPT_ATTR = Object.keys(ACCEPTED_MIME_TYPES).join(',')

interface DocumentUploadAreaProps {
  onUploaded: (document: IntakeDocument) => void
  disabled?: boolean
  /**
   * When set, finalizes the upload via `POST /documents/:id/resubmit` instead of the
   * normal `POST /documents` registration — used for the "Upload New Version" flow after
   * a document has been reset. The presign + S3 PUT steps are identical either way.
   */
  resubmitDocumentId?: string
  /** Overrides the button label — e.g. "Upload New Version" for the resubmit flow. */
  buttonLabel?: string
}

function DocumentUploadArea({
  onUploaded,
  disabled = false,
  resubmitDocumentId,
  buttonLabel = 'Browse files',
}: DocumentUploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    if (disabled) return
    if (!ACCEPTED_MIME_TYPES[file.type]) {
      setUploadError('Unsupported file type. Please upload a PDF, DOCX, XLSX, or TXT file.')
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const { url, key } = await apiClient
        .post<{ url: string; key: string }>('/upload/presign?folder=documents', {
          fileName: file.name,
          contentType: file.type,
        })
        .then((r) => r.data)

      await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })

      const payload: RegisterDocumentRequest = {
        fileName: file.name,
        fileType: file.type,
        s3Key: key,
        fileSize: file.size,
      }

      const doc = resubmitDocumentId
        ? await documentApi.resubmitDocument(resubmitDocumentId, payload)
        : await documentApi.registerDocument(payload)
      onUploaded(doc)
    } catch (err) {
      setUploadError(getApiErrorMessage(err, 'Upload failed. Please try again.'))
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
  }

  return (
    <Stack gap="sm">
      <Box
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setIsDragging(true)
        }}
        onDragLeave={() => {
          setIsDragging(false)
        }}
        onDrop={disabled ? undefined : onDrop}
        style={(theme) => ({
          border: `2px dashed ${disabled ? theme.colors.gray[3] : isDragging ? theme.colors.blue[5] : theme.colors.gray[4]}`,
          borderRadius: theme.radius.sm,
          padding: theme.spacing.xl,
          textAlign: 'center',
          backgroundColor: disabled
            ? theme.colors.gray[1]
            : isDragging
              ? theme.colors.blue[0]
              : 'transparent',
          cursor: disabled ? 'not-allowed' : isUploading ? 'wait' : 'pointer',
          transition: 'border-color 150ms ease, background-color 150ms ease',
          opacity: disabled ? 0.6 : 1,
        })}
        onClick={() => {
          if (!isUploading && !disabled) inputRef.current?.click()
        }}
      >
        <Stack align="center" gap="xs">
          <UploadSimpleIcon size={32} weight="light" />
          <Text size="sm" fw={500}>
            {disabled
              ? 'Document uploads are closed'
              : isUploading
                ? 'Uploading…'
                : 'Drag & drop a file here, or click to browse'}
          </Text>
          <Text size="xs" c="dimmed">
            Supported: PDF, DOCX, XLSX, TXT
          </Text>
        </Stack>
      </Box>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        style={{ display: 'none' }}
        onChange={onInputChange}
        disabled={disabled}
      />

      <Group justify="flex-end">
        <Button
          size="sm"
          leftSection={<UploadSimpleIcon size={16} />}
          loading={isUploading}
          disabled={disabled}
          onClick={() => {
            if (!disabled) inputRef.current?.click()
          }}
          variant="light"
        >
          {buttonLabel}
        </Button>
      </Group>

      {uploadError !== null ? (
        <Alert
          color="red"
          title="Upload error"
          onClose={() => {
            setUploadError(null)
          }}
          withCloseButton
        >
          {uploadError}
        </Alert>
      ) : null}
    </Stack>
  )
}

export { DocumentUploadArea }
