import {
  useSearchParams,
  useLocation,
  Link,
} from "react-router-dom";

import {
  CheckCircle2,
  XCircle,
  Clock3,
  LayoutDashboard,
  Home,
} from "lucide-react";


/**
 * ============================================================
 * ROTA PARA REPETIR O PAGAMENTO
 * ============================================================
 *
 * Cada canal retorna para seu próprio contexto.
 *
 * student:
 * aluno já está autenticado
 *
 * public/invoice:
 * usuário está em fluxo público
 */
const RETRY_PATH_BY_CHANNEL = {
  student: "/aluno/financeiro",
  public: "/pagamento/fatura",
  invoice: "/pagamento/fatura",
};


/**
 * ============================================================
 * ROTA APÓS PAGAMENTO APROVADO
 * ============================================================
 *
 * ESTE É O PONTO QUE CORRIGE O BUG.
 *
 * Antes:
 *
 * todo mundo era enviado para "/"
 *
 * Isso era errado para:
 *
 * via=student
 *
 * porque o aluno continuava autenticado,
 * mas era jogado para a Home pública.
 *
 * Agora:
 *
 * student → /aluno
 *
 * public  → /
 *
 * invoice → /
 */
const SUCCESS_PATH_BY_CHANNEL = {
  student: "/aluno",
  public: "/",
  invoice: "/",
};


/**
 * ============================================================
 * TEXTO DO BOTÃO DE SUCESSO
 * ============================================================
 */
const SUCCESS_LABEL_BY_CHANNEL = {
  student: "Ir para minha área",
  public: "Voltar ao início",
  invoice: "Voltar ao início",
};


/**
 * ============================================================
 * CHECKOUT RESULT
 * ============================================================
 *
 * Esta página é compartilhada por:
 *
 * 1. compra feita pelo aluno autenticado
 *
 *    via=student
 *
 * 2. checkout público
 *
 *    via=public
 *
 * 3. pagamento por link de invoice
 *
 *    via=invoice
 *
 *
 * O parâmetro "via" é fundamental porque determina
 * para onde o usuário deve voltar depois do pagamento.
 */
export default function CheckoutResult() {
  const [searchParams] =
    useSearchParams();

  const location = useLocation();


  /**
   * Estado final do pagamento.
   *
   * Exemplos:
   *
   * approved
   * rejected
   * cancelled
   */
  const status =
    searchParams.get("status");


  /**
   * Canal de onde o pagamento nasceu.
   */
  const via =
    searchParams.get("via") ||
    "public";

  const invoiceId =
    searchParams.get("invoiceId");

  const storedAccessPath =
    invoiceId
      ? sessionStorage.getItem(
          `coursehub-public-course-access:${invoiceId}`
        )
      : "";

  const accessPath =
    location.state?.accessPath ||
    storedAccessPath ||
    "";


  /**
   * Alguns fluxos chegam aqui quando
   * a cobrança existe mas o pagamento
   * precisa ser tentado novamente.
   */
  const isRetry =
    searchParams.get("retry") ===
    "1";


  /**
   * Caminho para nova tentativa.
   */
  const retryPath =
    RETRY_PATH_BY_CHANNEL[via] ||
    "/pagamento/fatura";


  /**
   * Caminho correto depois do sucesso.
   */
  const opensPurchasedCourse =
    via === "public" &&
    status === "approved" &&
    Boolean(accessPath);


  const successPath =
    opensPurchasedCourse
      ? accessPath
      : SUCCESS_PATH_BY_CHANNEL[via] ||
        "/";


  /**
   * Texto correto do botão.
   */
  const successLabel =
    opensPurchasedCourse
      ? "Acessar o curso"
      : SUCCESS_LABEL_BY_CHANNEL[via] ||
        "Voltar ao início";


  /**
   * Verifica se este pagamento
   * pertence ao fluxo autenticado
   * do aluno.
   */
  const isStudentChannel =
    via === "student";


  /**
   * ==========================================================
   * PAGAMENTO PENDENTE PARA RETRY
   * OU PAGAMENTO NÃO APROVADO
   * ==========================================================
   */
  if (
    isRetry ||
    status === "rejected" ||
    status === "cancelled"
  ) {
    return (
      <div
        className="
          mx-auto
          flex
          max-w-md
          flex-col
          items-center
          px-4
          py-24
          text-center
          sm:px-6
        "
      >
        <div
          className="
            flex
            h-14
            w-14
            items-center
            justify-center
            rounded-full
            bg-amber-50
            text-amber-600
          "
        >
          <Clock3
            size={26}
            aria-hidden="true"
          />
        </div>


        <h1
          className="
            mt-6
            text-xl
            font-bold
            text-gray-900
          "
        >
          {isRetry
            ? "Cobrança criada — pagamento pendente"
            : "Pagamento não aprovado"}
        </h1>


        <p
          className="
            mt-2
            text-sm
            text-gray-500
          "
        >
          {isRetry
            ? (
              <>
                Sua contratação foi
                registrada, mas não
                conseguimos iniciar o
                pagamento agora.

                Você pode tentar novamente
                a qualquer momento — a
                cobrança continua disponível.
              </>
            )
            : (
              <>
                O pagamento não foi
                aprovado.

                Você pode tentar novamente.
              </>
            )}
        </p>


        <Link
          to={retryPath}
          className="
            mt-6
            inline-flex
            h-11
            items-center
            justify-center
            rounded-xl
            bg-slate-950
            px-6
            text-sm
            font-semibold
            text-white
            transition
            hover:bg-slate-800
          "
        >
          Tentar pagamento novamente
        </Link>
      </div>
    );
  }


  /**
   * ==========================================================
   * PAGAMENTO APROVADO
   * ==========================================================
   */
  if (status === "approved") {
    return (
      <div
        className="
          mx-auto
          flex
          max-w-md
          flex-col
          items-center
          px-4
          py-24
          text-center
          sm:px-6
        "
      >
        <div
          className="
            flex
            h-14
            w-14
            items-center
            justify-center
            rounded-full
            bg-emerald-50
            text-emerald-600
          "
        >
          <CheckCircle2
            size={26}
            aria-hidden="true"
          />
        </div>


        <h1
          className="
            mt-6
            text-xl
            font-bold
            text-gray-900
          "
        >
          Pagamento confirmado
        </h1>


        <p
          className="
            mt-2
            text-sm
            text-gray-500
          "
        >
          {isStudentChannel
            ? (
              <>
                Seu pagamento foi
                confirmado e o novo curso
                foi adicionado à sua conta.

                Você pode continuar
                navegando pela sua área
                de aluno.
              </>
            )
            : opensPurchasedCourse ? (
              accessPath.startsWith("/ativar-conta") ? (
                <>
                  Seu pagamento foi
                  confirmado e a matrícula
                  no curso já está liberada.

                  Defina uma senha para
                  entrar.
                </>
              ) : (
                <>
                  Seu pagamento foi
                  confirmado.

                  Entre com o e-mail usado
                  na compra para abrir o
                  curso.
                </>
              )
            ) : (
              <>
                Recebemos a confirmação
                do seu pagamento.

                Você receberá um e-mail
                em instantes com as
                instruções de acesso ao
                curso.
              </>
            )}
        </p>


        <Link
          to={successPath}
          className="
            mt-6
            inline-flex
            h-11
            items-center
            justify-center
            gap-2
            rounded-xl
            bg-slate-950
            px-6
            text-sm
            font-semibold
            text-white
            transition
            hover:bg-slate-800
          "
        >
          {isStudentChannel || opensPurchasedCourse ? (
            <LayoutDashboard
              size={17}
              aria-hidden="true"
            />
          ) : (
            <Home
              size={17}
              aria-hidden="true"
            />
          )}

          {successLabel}
        </Link>


        {isStudentChannel && (
          <Link
            to="/aluno/meus-cursos"
            className="
              mt-3
              text-sm
              font-semibold
              text-slate-950
              transition
              hover:text-slate-700
              hover:underline
            "
          >
            Ver meus cursos
          </Link>
        )}
      </div>
    );
  }


  /**
   * ==========================================================
   * ESTADO INESPERADO
   * ==========================================================
   */
  return (
    <div
      className="
        mx-auto
        flex
        max-w-md
        flex-col
        items-center
        px-4
        py-24
        text-center
        sm:px-6
      "
    >
      <div
        className="
          flex
          h-14
          w-14
          items-center
          justify-center
          rounded-full
          bg-red-50
          text-red-600
        "
      >
        <XCircle
          size={26}
          aria-hidden="true"
        />
      </div>


      <h1
        className="
          mt-6
          text-xl
          font-bold
          text-gray-900
        "
      >
        Não foi possível confirmar
        o pagamento
      </h1>


      <p
        className="
          mt-2
          text-sm
          text-gray-500
        "
      >
        Ocorreu um problema ao consultar
        o status do pagamento.

        Você pode tentar novamente.
      </p>


      <Link
        to={retryPath}
        className="
          mt-6
          inline-flex
          h-11
          items-center
          justify-center
          rounded-xl
          bg-slate-950
          px-6
          text-sm
          font-semibold
          text-white
          transition
          hover:bg-slate-800
        "
      >
        Tentar novamente
      </Link>
    </div>
  );
}