import { useAuth } from "../auth/AuthContext";

export default function LogoutButton() {
  const { logout } = useAuth();

  async function handleLogout() {
    await logout({ goHome: true });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
    >
      Sair
    </button>
  );
}