import LoginForm from '../components/LoginForm'

function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold text-gray-800">
          Sistema de Facturación
        </h1>
        <LoginForm />
      </div>
    </div>
  )
}

export default LoginPage
