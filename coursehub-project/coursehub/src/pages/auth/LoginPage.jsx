import { useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { getRoleHomePath } from "../../auth/roleHome";
import DemoGuide from "../../components/demo/DemoGuide";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErro("");

    if (!email || !password) {
      setErro("Informe seu e-mail e sua senha.");
      return;
    }

    try {
      setLoading(true);

      const user = await login(email, password);

      navigate(getRoleHomePath(user.role), { replace: true });
    } catch (error) {
      setErro(error.message || "Não foi possível entrar na sua conta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header>
        <p className="text-sm font-semibold text-blue-600">
          Boas-vindas de volta
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Entre na sua conta
        </h1>

        <p className="mt-3 text-[15px] leading-6 text-slate-500">
          Use seus dados de acesso para continuar sua jornada no CourseHub.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-5"
      >
        {erro && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
          >
            {erro}
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            E-mail
          </label>

          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu@email.com"
            className="
              h-12 w-full rounded-xl border border-slate-300
              bg-white px-4 text-[15px] text-slate-950
              outline-none transition
              placeholder:text-slate-400
              hover:border-slate-400
              focus:border-blue-500
              focus:ring-4 focus:ring-blue-500/10
            "
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-4">
            <label
              htmlFor="password"
              className="text-sm font-medium text-slate-700"
            >
              Senha
            </label>

            <button
              type="button"
              onClick={() => navigate("/esqueci-minha-senha")}
              className="text-sm font-medium text-blue-600 transition hover:text-blue-700"
            >
              Esqueci minha senha
            </button>
          </div>

          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Digite sua senha"
              className="
                h-12 w-full rounded-xl border border-slate-300
                bg-white px-4 pr-12 text-[15px] text-slate-950
                outline-none transition
                placeholder:text-slate-400
                hover:border-slate-400
                focus:border-blue-500
                focus:ring-4 focus:ring-blue-500/10
              "
            />

            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="
                absolute right-3 top-1/2
                flex -translate-y-1/2 items-center justify-center
                rounded-lg p-1.5 text-slate-400
                transition hover:bg-slate-100 hover:text-slate-700
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

        <button
          type="submit"
          disabled={loading}
          className="
            flex h-12 w-full items-center justify-center gap-2
            rounded-xl bg-slate-950 px-5
            text-[15px] font-semibold text-white
            transition
            hover:bg-slate-800
            focus:outline-none focus:ring-4 focus:ring-slate-950/15
            disabled:cursor-not-allowed disabled:bg-slate-400
          "
        >
          {loading && (
            <LoaderCircle
              size={18}
              className="animate-spin"
              aria-hidden="true"
            />
          )}

          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="mt-8 border-t border-slate-200 pt-6">
        <p className="text-center text-sm text-slate-500">
          Ainda não possui uma conta?{" "}
          <button
            type="button"
            onClick={() => navigate("/courses")}
            className="font-semibold text-blue-600 transition hover:text-blue-700"
          >
            Ver cursos
          </button>
        </p>
      </div>

      <DemoGuide
        variant="login"
        onUseAccount={({ email: nextEmail, password: nextPassword }) => {
          setEmail(nextEmail);
          setPassword(nextPassword);
        }}
      />
    </>
  );
}