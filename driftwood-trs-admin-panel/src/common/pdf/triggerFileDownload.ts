/** Saves a `Blob` the browser already has (e.g. a PDF fetched from the backend) as a file —
 *  no library needed, the same object-URL + synthetic-click pattern used for any
 *  backend-generated file download. Revokes the object URL immediately after the click is
 *  dispatched so it doesn't linger. */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
