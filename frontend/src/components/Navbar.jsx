import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const linkBaseClass = 'rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-800'
const linkActiveClass = 'bg-blue-50 text-blue-700'

function navLinkClassName({ isActive }) {
  return isActive ? `${linkBaseClass} ${linkActiveClass}` : linkBaseClass
}

function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav className="border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <span className="text-base font-semibold text-gray-800">Sistema de Facturación</span>
          <div className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={navLinkClassName}>
              Inicio
            </NavLink>
            <NavLink to="/invoices/new" className={navLinkClassName}>
              Nueva factura
            </NavLink>
            {/* `end` is required here: without it, NavLink treats "/invoices"
                as a prefix match, so it also lights up on "/invoices/new" and
                "/invoices/:id" at the same time as those pages' own link --
                this was the "both tabs stay highlighted" bug. */}
            <NavLink to="/invoices" end className={navLinkClassName}>
              Historial
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/products" className={navLinkClassName}>
                Productos
              </NavLink>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-gray-600">
            {user?.username} ({user?.role})
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
