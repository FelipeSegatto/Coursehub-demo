import { useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";
import { createPricingPlan, updatePricingPlan } from "../../services/AdminPricingPlanService";

function formatCurrency(value) {
  const numericValue = Number(value || 0);

  return numericValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const INITIAL_FORM = {
  course_id: "",
  name: "",
  description: "",
  billing_type: "one_time",
  total_amount: "",
  monthly_payment_count: "",
  monthly_payment_amount: "",
  max_card_installments: "1",
  accepts_pix: true,
  accepts_boleto: true,
  accepts_credit_card: true,
  status: "active",
};

export default function PricingPlanModal({ mode = "create", initialData = null, handleCloseModal, onSuccess }) {
  const isEditMode = mode === "edit";

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState(() =>
    initialData
      ? {
          course_id: String(initialData.courseId ?? ""),
          name: initialData.name ?? "",
          description: initialData.description ?? "",
          billing_type: initialData.billingType ?? "one_time",
          total_amount: initialData.totalAmount ?? "",
          monthly_payment_count: initialData.monthlyPaymentCount ?? "",
          monthly_payment_amount: initialData.monthlyPaymentAmount ?? "",
          max_card_installments: String(initialData.maxCardInstallments ?? "1"),
          accepts_pix: Boolean(initialData.acceptsPix),
          accepts_boleto: Boolean(initialData.acceptsBoleto),
          accepts_credit_card: Boolean(initialData.acceptsCreditCard),
          status: initialData.status ?? "active",
        }
      : INITIAL_FORM
  );

  useEffect(() => {
    let ignoreRequest = false;

    async function fetchCourses() {
      try {
        setLoadingCourses(true);

        const response = await apiFetch("/api/admin/courses");
        const courseList = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : [];

        if (!ignoreRequest) {
          setCourses(courseList);
        }
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("Erro ao carregar cursos:", requestError);
        setError(requestError.message || "Não foi possível carregar a lista de cursos.");
      } finally {
        if (!ignoreRequest) {
          setLoadingCourses(false);
        }
      }
    }

    fetchCourses();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  const isMonthlyPlan = formData.billing_type === "monthly_plan";

  const computedMonthlyTotal =
    isMonthlyPlan && formData.monthly_payment_count && formData.monthly_payment_amount
      ? Number(formData.monthly_payment_count) * Number(formData.monthly_payment_amount)
      : null;

  function validateForm() {
    if (!formData.course_id) {
      return "Selecione o curso associado ao plano.";
    }

    if (!formData.name.trim()) {
      return "O nome do plano é obrigatório.";
    }

    if (formData.name.trim().length > 100) {
      return "O nome do plano deve ter no máximo 100 caracteres.";
    }

    if (!formData.accepts_pix && !formData.accepts_boleto && !formData.accepts_credit_card) {
      return "Selecione ao menos uma forma de pagamento.";
    }

    if (formData.accepts_credit_card) {
      const installments = Number(formData.max_card_installments);

      if (!Number.isInteger(installments) || installments < 1 || installments > 12) {
        return "O parcelamento no cartão deve ser um número inteiro entre 1 e 12.";
      }
    }

    if (isMonthlyPlan) {
      if (!formData.monthly_payment_count || Number(formData.monthly_payment_count) <= 0) {
        return "Informe a quantidade de mensalidades.";
      }

      if (!formData.monthly_payment_amount || Number(formData.monthly_payment_amount) <= 0) {
        return "Informe o valor da mensalidade.";
      }
    } else if (!formData.total_amount || Number(formData.total_amount) <= 0) {
      return "Informe o valor total do plano.";
    }

    return "";
  }

  function buildPayload() {
    return {
      course_id: Number(formData.course_id),
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      billing_type: formData.billing_type,
      // O total de um plano mensal é sempre recalculado pelo backend
      // (quantidade × mensalidade) -- o valor abaixo é só uma prévia
      // para o admin, nunca a fonte da verdade.
      total_amount: isMonthlyPlan ? undefined : Number(formData.total_amount),
      monthly_payment_count: isMonthlyPlan ? Number(formData.monthly_payment_count) : null,
      monthly_payment_amount: isMonthlyPlan ? Number(formData.monthly_payment_amount) : null,
      max_card_installments: formData.accepts_credit_card
        ? Number(formData.max_card_installments)
        : 1,
      accepts_pix: formData.accepts_pix,
      accepts_boleto: formData.accepts_boleto,
      accepts_credit_card: formData.accepts_credit_card,
      status: formData.status,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setError("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);

      const payload = buildPayload();

      const result = isEditMode
        ? await updatePricingPlan(initialData.id, payload)
        : await createPricingPlan(payload);

      await onSuccess?.(result);
    } catch (requestError) {
      console.error("Erro ao salvar plano comercial:", requestError);
      setError(requestError.message || "Erro ao salvar plano comercial.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";
  const labelClass = "block text-sm font-medium text-gray-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleCloseModal}
          disabled={loading}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✕
        </button>

        <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-14">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditMode ? "Editar plano comercial" : "Cadastrar plano comercial"}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {isEditMode
              ? "Altere os dados abaixo para atualizar este plano."
              : "Preencha os dados abaixo para adicionar um novo plano comercial."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          {isEditMode && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              As alterações serão aplicadas somente a contratos futuros. Contratos já criados
              preservam as condições comerciais originais.
            </p>
          )}

          <label className={labelClass}>
            Curso

            <select
              name="course_id"
              value={formData.course_id}
              onChange={handleChange}
              required
              disabled={loadingCourses}
              className={inputClass}
            >
              <option value="">
                {loadingCourses ? "Carregando cursos..." : "Selecione um curso"}
              </option>

              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Nome do plano

            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              maxLength={100}
              placeholder="Ex: Pagamento à vista"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Descrição

            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="2"
              placeholder="Breve descrição do plano..."
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Tipo de cobrança

            <select
              name="billing_type"
              value={formData.billing_type}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="one_time">Pagamento único</option>
              <option value="monthly_plan">Plano mensal</option>
            </select>
          </label>

          {isMonthlyPlan ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className={labelClass}>
                Quantidade de mensalidades

                <input
                  type="number"
                  name="monthly_payment_count"
                  value={formData.monthly_payment_count}
                  onChange={handleChange}
                  min="1"
                  required
                  placeholder="Ex: 6"
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Valor da mensalidade

                <input
                  type="number"
                  name="monthly_payment_amount"
                  value={formData.monthly_payment_amount}
                  onChange={handleChange}
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="Ex: 280.00"
                  className={inputClass}
                />
              </label>

              {computedMonthlyTotal !== null && (
                <p className="md:col-span-2 text-sm text-gray-500">
                  Valor total calculado pelo sistema:{" "}
                  <strong className="text-gray-800">{formatCurrency(computedMonthlyTotal)}</strong>
                </p>
              )}
            </div>
          ) : (
            <label className={labelClass}>
              Valor total

              <input
                type="number"
                name="total_amount"
                value={formData.total_amount}
                onChange={handleChange}
                min="0.01"
                step="0.01"
                required
                placeholder="Ex: 1490.00"
                className={inputClass}
              />
            </label>
          )}

          <fieldset>
            <legend className={labelClass}>Formas de pagamento aceitas</legend>

            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="accepts_pix"
                  checked={formData.accepts_pix}
                  onChange={handleChange}
                />
                Pix
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="accepts_boleto"
                  checked={formData.accepts_boleto}
                  onChange={handleChange}
                />
                Boleto
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  name="accepts_credit_card"
                  checked={formData.accepts_credit_card}
                  onChange={handleChange}
                />
                Cartão de crédito
              </label>
            </div>
          </fieldset>

          {formData.accepts_credit_card && (
            <label className={labelClass}>
              Parcelamento máximo no cartão

              <input
                type="number"
                name="max_card_installments"
                value={formData.max_card_installments}
                onChange={handleChange}
                min="1"
                max="12"
                required
                className={inputClass}
              />
            </label>
          )}

          <label className={labelClass}>
            Status

            <select name="status" value={formData.status} onChange={handleChange} className={inputClass}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </label>

          <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={loading}
              className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading || loadingCourses}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {loading ? "Salvando..." : isEditMode ? "Salvar alterações" : "Salvar plano"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
