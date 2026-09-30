import { Navigate, Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import { useAuth } from '../hooks/useAuth'

function ProtectedRoute({ roles }) {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/" replace />
  }

  return (
    <>
      <Navbar />
      <Outlet />
    </>
  )
}

export default ProtectedRoute
