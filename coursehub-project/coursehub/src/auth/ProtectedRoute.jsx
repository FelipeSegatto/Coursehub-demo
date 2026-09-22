import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute() {
  const { estaLogado, loading } = useAuth();

  if (loading) {
    return <p>Carregando...</p>;
  }

  if (!estaLogado) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}