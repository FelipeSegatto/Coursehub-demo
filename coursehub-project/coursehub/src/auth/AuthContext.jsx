import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import { apiFetch } from "../services/APIService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuarioLogado, setUsuarioLogado] =
    useState(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAuthenticatedUser() {
      try {
        // Usa apiFetch (não fetch cru) para que, se o access token já
        // tiver expirado quando a página carrega, a sessão seja
        // renovada automaticamente via refresh token antes de desistir.
        const data = await apiFetch("/api/profile/me");

        setUsuarioLogado(data.profile);
      } catch (error) {
        console.error(
          "Erro ao carregar usuário autenticado:",
          error
        );

        setUsuarioLogado(null);
      } finally {
        setLoading(false);
      }
    }

    loadAuthenticatedUser();
  }, []);

  async function login(email, password) {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    setUsuarioLogado(data.profile);

    return data.profile;
  }

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error("Erro ao sair:", error);
    } finally {
      setUsuarioLogado(null);
    }
  }

  function atualizarUsuarioLogado(updatedData) {
    setUsuarioLogado((currentUser) => {
      if (!currentUser) {
        return currentUser;
      }

      return {
        ...currentUser,
        ...updatedData,
      };
    });
  }

  const estaLogado = Boolean(usuarioLogado);

  return (
    <AuthContext.Provider
      value={{
        usuarioLogado,
        loading,
        estaLogado,
        login,
        logout,
        atualizarUsuarioLogado,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth deve ser usado dentro de AuthProvider."
    );
  }

  return context;
}