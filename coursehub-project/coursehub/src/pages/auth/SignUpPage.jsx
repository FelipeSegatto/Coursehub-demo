import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function SignUpPage() {
  return (
    <>
      <header>
        <p className="text-sm font-semibold text-blue-600">Matrícula</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          O cadastro acontece no checkout
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-slate-500">
          Não há criação de conta avulsa. Escolha um curso, avance no checkout e a
          conta do aluno é criada junto com o contrato. Matrículas institucionais
          são feitas pela secretaria.
        </p>
      </header>

      <div className="mt-8 space-y-3">
        <Link
          to="/courses"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-[15px] font-semibold text-white transition hover:bg-slate-800"
        >
          Ver cursos
          <ArrowRight size={17} />
        </Link>
        <Link
          to="/login"
          className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 text-[15px] font-semibold text-slate-800 transition hover:bg-slate-50"
        >
          Já tenho uma conta
        </Link>
      </div>
    </>
  );
}
