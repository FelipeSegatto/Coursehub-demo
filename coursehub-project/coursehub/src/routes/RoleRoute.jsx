import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getRoleHomePath } from "../auth/roleHome";

/**
 * A logged-in user hitting a route reserved for another role (either
 * by typing the URL directly or via a stale link) is bounced to their
 * OWN role's home, not the public homepage -- same idea as
 * PublicOnlyRoute bouncing an already-logged-in user away from
 * /login, just triggered by a role mismatch instead of a session
 * already existing.
 */
export default function RoleRoute({ allowedRoles }) {
  const { usuarioLogado, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>Carregando...</p>
      </main>
    );
  }

  if (!usuarioLogado) {
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(usuarioLogado.role)) {
    return <Navigate to={getRoleHomePath(usuarioLogado.role)} replace />;
  }

  return <Outlet />;
}