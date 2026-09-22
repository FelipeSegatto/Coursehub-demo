import { useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../services/APIService";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;

    setPasswordData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!token) {
      setError(
        "Link de redefinição inválido. Solicite um novo link."
      );
      return;
    }

    const { newPassword, confirmPassword } = passwordData;

    if (!newPassword || !confirmPassword) {
      setError("Informe a nova senha e a confirmação.");
      return;
    }

    if (newPassword.length < 6) {
      setError(
        "A nova senha deve possuir pelo menos 6 caracteres."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("A confirmação da nova senha não confere.");
      return;
    }

    try {
      setIsSubmitting(true);

      const data = await apiFetch(
        "/api/forgot-password/reset",
        {
          method: "PATCH",
          body: JSON.stringify({
            token,
            newPassword,
            confirmPassword,
          }),
        }
      );

      setMessage(
        data?.message ||
          "Senha redefinida com sucesso. Redirecionando para o login..."
      );

      setPasswordData({
        newPassword: "",
        confirmPassword: "",
      });

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2000);
    } catch (error) {
      console.error("Erro ao redefinir senha:", error);

      setError(
        error.message || "Não foi possível redefinir a senha."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => navigate("/login")}
        className="
          mb-8 inline-flex items-center gap-2
          text-sm font-medium text-slate-500
          transition
          hover:text-slate-950
        "
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Voltar para o login
      </button>

      <header>
        <div
          className="
            flex h-11 w-11 items-center justify-center
            rounded-xl bg-blue-50 text-blue-600
          "
        >
          <LockKeyhole size={21} aria-hidden="true" />
        </div>

        <p className="mt-6 text-sm font-semibold text-blue-600">
          Nova senha
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Crie uma nova senha
        </h1>

        <p className="mt-3 text-[15px] leading-6 text-slate-500">
          Escolha uma senha segura para voltar a acessar sua conta.
        </p>
      </header>

      {!token && (
        <div
          role="alert"
          className="
            mt-7 rounded-xl border border-red-200
            bg-red-50 px-4 py-3
            text-sm leading-6 text-red-700
          "
        >
          Este link de redefinição é inválido ou está incompleto.
          Solicite um novo link na tela de recuperação de senha.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-5"
      >
        <PasswordField
          id="new-password"
          label="Nova senha"
          name="newPassword"
          value={passwordData.newPassword}
          onChange={handleChange}
          showPassword={showNewPassword}
          onToggleVisibility={() =>
            setShowNewPassword((current) => !current)
          }
          autoComplete="new-password"
          placeholder="Crie uma nova senha"
        />

        <div>
          <PasswordField
            id="confirm-password"
            label="Confirmar nova senha"
            name="confirmPassword"
            value={passwordData.confirmPassword}
            onChange={handleChange}
            showPassword={showConfirmPassword}
            onToggleVisibility={() =>
              setShowConfirmPassword((current) => !current)
            }
            autoComplete="new-password"
            placeholder="Digite a senha novamente"
          />
        </div>

        <p className="text-xs leading-5 text-slate-400">
          Use pelo menos 6 caracteres.
        </p>

        {message && (
          <div
            role="status"
            className="
              rounded-xl border border-emerald-200
              bg-emerald-50 px-4 py-3
              text-sm leading-6 text-emerald-700
            "
          >
            {message}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="
              rounded-xl border border-red-200
              bg-red-50 px-4 py-3
              text-sm leading-6 text-red-700
            "
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !token}
          className="
            flex h-12 w-full items-center justify-center gap-2
            rounded-xl bg-slate-950 px-5
            text-[15px] font-semibold text-white
            transition
            hover:bg-slate-800
            focus:outline-none
            focus:ring-4 focus:ring-slate-950/15
            disabled:cursor-not-allowed
            disabled:bg-slate-400
          "
        >
          {isSubmitting && (
            <LoaderCircle
              size={18}
              className="animate-spin"
              aria-hidden="true"
            />
          )}

          {isSubmitting
            ? "Redefinindo..."
            : "Redefinir senha"}
        </button>
      </form>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <p className="text-center text-sm text-slate-500">
          Lembrou sua senha?{" "}
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="
              font-semibold text-blue-600
              transition hover:text-blue-700
            "
          >
            Entrar
          </button>
        </p>
      </div>
    </>
  );
}

function PasswordField({
  id,
  label,
  name,
  value,
  onChange,
  showPassword,
  onToggleVisibility,
  autoComplete,
  placeholder,
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          name={name}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          className="
            h-12 w-full rounded-xl
            border border-slate-300
            bg-white px-4 pr-12
            text-[15px] text-slate-950
            outline-none transition
            placeholder:text-slate-400
            hover:border-slate-400
            focus:border-blue-500
            focus:ring-4 focus:ring-blue-500/10
          "
        />

        <button
          type="button"
          onClick={onToggleVisibility}
          aria-label={
            showPassword
              ? "Ocultar senha"
              : "Mostrar senha"
          }
          className="
            absolute right-3 top-1/2
            flex -translate-y-1/2
            items-center justify-center
            rounded-lg p-1.5
            text-slate-400 transition
            hover:bg-slate-100
            hover:text-slate-700
          "
        >
          {showPassword ? (
            <EyeOff size={19} aria-hidden="true" />
          ) : (
            <Eye size={19} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}