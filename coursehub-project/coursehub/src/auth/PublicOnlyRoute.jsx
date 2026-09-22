import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { getRoleHomePath } from "./roleHome";

export default function PublicOnlyRoute() {
  const { usuarioLogado, loading } = useAuth();

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p>Carregando...</p>
      </main>
    );
  }

  if (!usuarioLogado) {
    return <Outlet />;
  }

  return <Navigate to={getRoleHomePath(usuarioLogado.role)} replace />;
}