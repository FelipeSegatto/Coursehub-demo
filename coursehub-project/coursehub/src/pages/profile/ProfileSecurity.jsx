import { useState } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { updateUserPassword } from "../../services/ProfileService";



function PasswordField({
  label,
  name,
  value,
  onChange,
  placeholder,
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      <input
        id={name}
        name={name}
        type="password"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="new-password"
        required
        className="min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  );
}

 function ProfileSecurity() {
  const navigate = useNavigate();
  const { usuarioLogado, logout } = useAuth();

  function handleBack() {
    const profileRoutes = {
      student: "/aluno/perfil",
      teacher: "/professor/perfil",
      admin: "/admin/perfil",
    };

    navigate(profileRoutes[usuarioLogado.role]);
  }

  const [formData, setFormData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (formData.newPassword !== formData.confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    if (formData.newPassword.length < 6) {
      setError("A nova senha deve possuir pelo menos 6 caracteres.");
      return;
    }

    try {
      setIsSaving(true);

      await updateUserPassword({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });

      setMessage(
        "Senha alterada com sucesso. Faça login novamente."
      );

      setFormData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      /*
        O backend encerra todas as sessões ao trocar a senha
        (por segurança). O cookie local já foi invalidado,
        então limpamos o estado de autenticação e redirecionamos
        para o login.
      */
      setTimeout(async () => {
        await logout();
        navigate("/login", { replace: true });
      }, 1500);
    } catch (error) {
      console.error("Erro ao alterar senha:", error);

      setError(
        error?.response?.data?.message ||
          error?.message ||
          "Não foi possível alterar a senha."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={handleBack}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-600"
        >
          <ArrowLeft size={18} />
          Voltar para o perfil
        </button>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 px-6 py-6 sm:px-8">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <LockKeyhole size={21} />
              </div>

              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Alterar senha
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Informe sua senha atual e escolha uma nova senha.
                </p>
              </div>
            </div>
          </header>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 px-6 py-6 sm:px-8"
          >
            <PasswordField
              label="Senha atual"
              name="currentPassword"
              value={formData.currentPassword}
              onChange={handleChange}
              placeholder="Digite sua senha atual"
            />

            <PasswordField
              label="Nova senha"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              placeholder="Digite a nova senha"
            />

            <PasswordField
              label="Confirmar nova senha"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Digite novamente a nova senha"
            />

            {message && (
              <p
                role="status"
                className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              >
                {message}
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </p>
            )}

            <div className="flex w-full pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Alterando..." : "Alterar senha"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

export default ProfileSecurity;