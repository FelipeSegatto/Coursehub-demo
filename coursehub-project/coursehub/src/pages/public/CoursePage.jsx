import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";
import { publicImageUrl } from "../../utils/publicImageUrl";

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const BILLING_TYPE_LABEL = {
  one_time: "Pagamento único",
  monthly_plan: "Plano mensal",
};

const PAYMENT_METHOD_LABEL = {
  acceptsPix: "Pix",
  acceptsBoleto: "Boleto",
  acceptsCreditCard: "Cartão de crédito",
};

/**
 * courses.syllabus é texto livre sem convenção de formato imposta pelo
 * formulário de admin (textarea simples). Na base real coexistem: lista
 * separada por vírgula em uma linha; blocos "Módulo N — Título\nDescrição"
 * separados por linha em branco; e listas com marcador (* ) ou linha simples,
 * às vezes com um cabeçalho solto ("Ementa" / "Ementa do Curso – X") antes.
 * Esta função tenta reconhecer esses formatos reais em vez de assumir um
 * único delimitador.
 */
function parseSyllabus(rawSyllabus) {
  if (typeof rawSyllabus !== "string") {
    return Array.isArray(rawSyllabus) ? rawSyllabus.map((item) => ({ title: item, description: null })) : [];
  }

  const text = rawSyllabus.trim();
  if (!text) {
    return [];
  }

  let blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);

  if (blocks.length > 1 && /^ementa\b/i.test(blocks[0]) && !blocks[0].includes("\n")) {
    blocks = blocks.slice(1);
  }

  const items = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

    if (lines.length <= 2) {
      const [title, description] = lines;
      items.push({ title, description: description || null });
      continue;
    }

    for (const line of lines) {
      items.push({ title: line.replace(/^[*-]\s+/, ""), description: null });
    }
  }

  if (items.length === 1 && !items[0].description) {
    const singleLine = items[0].title;
    const parts = singleLine
      .split(/[,;]/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length > 1) {
      return parts.map((title) => ({ title, description: null }));
    }
  }

  return items;
}

export default function CoursePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { estaLogado, usuarioLogado } = useAuth();
  const plansSectionRef = useRef(null);

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [pricingPlans, setPricingPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);

  useEffect(() => {
    let componenteMontado = true;

    async function fetchCurso() {
      try {
        setLoading(true);
        setError("");

        console.log("ID recebido pela URL:", id);

        const data = await apiFetch(`/api/courses/${id}`);

        if (componenteMontado) {
          setCourse(data);
        }
      } catch (error) {
        console.error("Erro ao buscar curso:", error);

        if (componenteMontado) {
          setCourse(null);
          setError(
            error.message ||
              "Não foi possível carregar o curso."
          );
        }
      } finally {
        if (componenteMontado) {
          setLoading(false);
        }
      }
    }

    if (id) {
      fetchCurso();
    } else {
      setError("ID do curso não informado.");
      setLoading(false);
    }

    return () => {
      componenteMontado = false;
    };
  }, [id]);

  useEffect(() => {
    let componenteMontado = true;

    async function fetchPlanos() {
      if (!id) {
        return;
      }

      try {
        setPlansLoading(true);

        const data = await apiFetch(`/api/courses/${id}/pricing-plans`);

        if (componenteMontado) {
          setPricingPlans(Array.isArray(data) ? data : []);
        }
      } catch (fetchError) {
        console.error("Erro ao buscar planos do curso:", fetchError);

        if (componenteMontado) {
          setPricingPlans([]);
        }
      } finally {
        if (componenteMontado) {
          setPlansLoading(false);
        }
      }
    }

    fetchPlanos();

    return () => {
      componenteMontado = false;
    };
  }, [id]);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Carregando curso...
        </h1>
      </main>
    );
  }

  if (error || !course) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Curso não encontrado
        </h1>

        <p className="mt-3 text-red-600">
          {error || "Não foi possível localizar este curso."}
        </p>

        <Link
          to="/courses"
          className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
        >
          Voltar para cursos
        </Link>
      </main>
    );
  }

  const syllabus = parseSyllabus(course.syllabus);

  const pricing = course.pricing;

  function goToCheckout(planId) {
    const isAuthenticatedStudent = estaLogado && usuarioLogado?.role === "student";
    const query = planId ? `?plan=${planId}` : "";

    if (isAuthenticatedStudent) {
      navigate(`/aluno/financeiro/comprar/${id}${query}`);
      return;
    }

    navigate(`/checkout/curso/${id}${query}`);
  }

  function handleComprarClick() {
    if (pricingPlans.length === 1) {
      goToCheckout(pricingPlans[0].id);
      return;
    }

    if (pricingPlans.length > 1) {
      plansSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Link
        to="/courses"
        className="text-sm font-semibold text-blue-600 hover:text-blue-700"
      >
        ← Voltar para cursos
      </Link>

      <h1 className="mt-6 text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
        {course.name}
      </h1>

      <div className="mt-4 flex flex-wrap gap-3">
        {course.nivel && (
          <span className="rounded-xl bg-blue-100 px-4 py-2 text-blue-700">
            {course.nivel}
          </span>
        )}

        {course.workload_hours && (
          <span className="rounded-xl bg-gray-100 px-4 py-2 text-gray-700">
            {course.workload_hours}h
          </span>
        )}

        {course.category && (
          <span className="rounded-xl bg-purple-100 px-4 py-2 text-purple-700">
            {course.category}
          </span>
        )}

        {course.teacher_name && (
          <span className="rounded-xl bg-green-100 px-4 py-2 text-green-700">
            Professor: {course.teacher_name}
          </span>
        )}
      </div>

      <img
        src={publicImageUrl(course.image_url)}
        alt={course.name}
        fetchPriority="high"
        loading="eager"
        decoding="async"
        className="mt-8 h-80 w-full rounded-2xl object-cover"
        onError={(event) => {
          event.currentTarget.src =
            "/images/default-course.webp";
        }}
      />

      <p className="mt-8 text-lg leading-8 text-gray-600">
        {course.expanded_description ||
          course.description ||
          "Este curso ainda não possui uma descrição detalhada."}
      </p>

      {syllabus.length > 0 && (
        <section className="mt-10">
          <h2 className="text-2xl font-bold text-gray-900">
            Conteúdo do curso
          </h2>

          <ul className="mt-4 list-disc space-y-3 pl-6 text-gray-700">
            {syllabus.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <span className={item.description ? "font-semibold text-gray-900" : undefined}>
                  {item.title}
                </span>

                {item.description && (
                  <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <p className="text-sm text-gray-500">
          Investimento
        </p>

        {pricing?.hasActivePlans ? (
          <>
            <strong className="mt-2 block text-3xl text-gray-900">
              Curso a partir de {formatCurrency(pricing.startingPrice)}
            </strong>

            {pricing.monthlyPaymentFrom !== null && (
              <p className="mt-1 text-sm text-gray-500">
                Mensalidades a partir de {formatCurrency(pricing.monthlyPaymentFrom)}
              </p>
            )}
          </>
        ) : (
          <strong className="mt-2 block text-3xl text-gray-900">
            Consulte os valores
          </strong>
        )}

        <button
          type="button"
          onClick={handleComprarClick}
          disabled={!pricingPlans.length && !plansLoading}
          className="mt-6 rounded-2xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Comprar curso
        </button>
      </div>

      {!plansLoading && pricingPlans.length > 0 && (
        <section ref={plansSectionRef} className="mt-10">
          <h2 className="text-2xl font-bold text-gray-900">
            Formas de pagamento
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {pricingPlans.map((plan) => {
              const methods = Object.entries(PAYMENT_METHOD_LABEL)
                .filter(([key]) => plan[key])
                .map(([, label]) => label);

              return (
                <div
                  key={plan.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5"
                >
                  <p className="text-sm font-semibold text-blue-600">
                    {BILLING_TYPE_LABEL[plan.billingType] || plan.billingType}
                  </p>

                  <h3 className="mt-1 text-lg font-bold text-gray-900">
                    {plan.name}
                  </h3>

                  {plan.description && (
                    <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
                  )}

                  <p className="mt-3 text-xl font-bold text-gray-900">
                    {formatCurrency(plan.totalAmount)}
                  </p>

                  {plan.billingType === "monthly_plan" && plan.monthlyPaymentCount && (
                    <p className="text-sm text-gray-500">
                      {plan.monthlyPaymentCount}x de {formatCurrency(plan.monthlyPaymentAmount)}
                    </p>
                  )}

                  {methods.length > 0 && (
                    <p className="mt-3 text-xs text-gray-400">
                      Aceita: {methods.join(", ")}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => goToCheckout(plan.id)}
                    className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Contratar este plano
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}