function LoadingSpinner() {
  return (
    <div role="status" aria-label="Cargando" className="inline-flex items-center">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      <span className="sr-only">Cargando...</span>
    </div>
  )
}

export default LoadingSpinner
