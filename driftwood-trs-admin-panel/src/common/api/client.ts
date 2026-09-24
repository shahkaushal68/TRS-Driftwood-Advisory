import axiosInstance, { type AxiosInstance } from 'axios'

interface ApiErrorResponse {
  error?: string
  message?: string | string[]
}

const serverUrl = import.meta.env.VITE_PUBLIC_SERVER_URL
if (!serverUrl) {
  throw new Error('VITE_PUBLIC_SERVER_URL is not configured.')
}

export const apiClient: AxiosInstance = axiosInstance.create({
  baseURL: serverUrl,
  withCredentials: true,
})

/** True when `error` is an axios error with a 404 response — used to treat "not found yet"
 *  as an expected empty state (e.g. no Manual Review saved yet) rather than a load failure. */
export const isNotFoundError = (error: unknown): boolean =>
  axiosInstance.isAxiosError(error) && error.response?.status === 404

export const getApiErrorMessage = (
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
) => {
  if (axiosInstance.isAxiosError<ApiErrorResponse>(error)) {
    const message = error.response?.data.message
    const responseError = error.response?.data.error

    if (Array.isArray(message)) {
      return message.join(', ')
    }

    if (typeof message === 'string' && message.length > 0) {
      return message
    }

    if (typeof responseError === 'string' && responseError.length > 0) {
      return responseError
    }

    if (error.message.length > 0) {
      return error.message
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  return fallback
}
