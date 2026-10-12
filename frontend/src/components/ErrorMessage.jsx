import { useEffect, useRef } from 'react'

function ErrorMessage({ message }) {
  const ref = useRef(null)

  // Scrolls itself into view whenever a new error appears -- on mobile an
  // error raised far down a long page/form (e.g. deleting a product from
  // the bottom of the list) otherwise renders off-screen with no visual
  // feedback that anything happened.
  useEffect(() => {
    if (message) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [message])

  if (!message) {
    return null
  }

  return (
    <div
      ref={ref}
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
    >
      {message}
    </div>
  )
}

export default ErrorMessage
