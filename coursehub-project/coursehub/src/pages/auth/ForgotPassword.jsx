import { useState } from "react";
import {
  ArrowLeft,
  LoaderCircle,
  Mail,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../services/APIService";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /*
    Sempre exibimos uma resposta genérica para não revelar
    quais e-mails estão cadastrados no sistema.

    Caso a conta exista, o usuário recebe um link de
    redefinição válido pelo período definido no backend.
  */
  async function handleSubmit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError("Informe seu e-mail.");
      return;
    }

    try {
      setIsSubmitting(true);

      const data = await apiFetch(
        "/api/forgot-password/check-email",
        {
          method: "POST",
          body: JSON.stringify({
            email: normalizedEmail,
          }),
        }
      );

      setMessage(
        data?.message ||
          "Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha."
      );

      setEmail("");
    } catch (error) {
      console.error(
        "Erro ao solicitar recuperação de senha:",
        error
      );

      setError(
        error.message ||
          "Não foi possível processar sua solicitação."
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
          <Mail size={21} aria-hidden="true" />
        </div>

        <p className="mt-6 text-sm font-semibold text-blue-600">
          Recuperar senha
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Esqueceu sua senha?
        </h1>

        <p className="mt-3 text-[15px] leading-6 text-slate-500">
          Informe seu e-mail. Caso exista uma conta associada,
          enviaremos um link para você criar uma nova senha.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mt-8"
      >
        <div>
          <label
            htmlFor="forgot-password-email"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            E-mail
          </label>

          <input
            id="forgot-password-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seuemail@exemplo.com"
            autoComplete="email"
            required
            className="
              h-12 w-full rounded-xl
              border border-slate-300
              bg-white px-4
              text-[15px] text-slate-950
              outline-none transition
              placeholder:text-slate-400
              hover:border-slate-400
              focus:border-blue-500
              focus:ring-4 focus:ring-blue-500/10
            "
          />
        </div>

        {message && (
          <Message type="success">
            {message}
          </Message>
        )}

        {error && (
          <Message type="error">
            {error}
          </Message>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="
            mt-6 flex h-12 w-full
            items-center justify-center gap-2
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
            ? "Enviando..."
            : "Enviar link de recuperação"}
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

function Message({ type, children }) {
  const isSuccess = type === "success";

  return (
    <div
      role={isSuccess ? "status" : "alert"}
      className={`
        mt-5 rounded-xl border px-4 py-3
        text-sm leading-6
        ${
          isSuccess
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-red-200 bg-red-50 text-red-700"
        }
      `}
    >
      {children}
    </div>
  );
}