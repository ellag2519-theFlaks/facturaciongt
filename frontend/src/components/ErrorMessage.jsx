function ErrorMessage({ message }) {
  if (!message) {
    return null
  }

  return (
    <div
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
    >
      {message}
    </div>
  )
}

export default ErrorMessage
