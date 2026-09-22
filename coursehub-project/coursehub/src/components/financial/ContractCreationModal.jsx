import { useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";
import { createFinancialContract } from "../../services/FinancialService";
import {
  searchContractingParties,
} from "../../services/ContractingPartyService";

const STEPS = ["Aluno", "Contratante", "Curso e plano", "Primeira cobrança", "Revisão"];

const RELATIONSHIP_OPTIONS = [
  { value: "parent", label: "Pai/Mãe" },
  { value: "guardian", label: "Responsável legal" },
  { value: "company", label: "Empresa" },
  { value: "other", label: "Outro" },
];

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const INITIAL_NEW_STUDENT = { name: "", email: "", birth_date: "", cpf: "", phone: "" };
const INITIAL_NEW_PARTY = {
  party_type: "individual",
  name: "",
  document_type: "cpf",
  document_number: "",
  email: "",
  phone: "",
  relationshipType: "parent",
};

export default function ContractCreationModal({
  handleCloseModal,
  onSuccess,
  entryPoint = "contracts",
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successResult, setSuccessResult] = useState(null);

  const [students, setStudents] = useState([]);
  const [studentMode, setStudentMode] = useState("existing");
  const [existingStudentId, setExistingStudentId] = useState("");
  const [newStudentData, setNewStudentData] = useState(INITIAL_NEW_STUDENT);

  const [contractingPartyMode, setContractingPartyMode] = useState("self");
  const [partySearchTerm, setPartySearchTerm] = useState("");
  const [partySearchResults, setPartySearchResults] = useState([]);
  const [existingPartyId, setExistingPartyId] = useState("");
  const [newPartyData, setNewPartyData] = useState(INITIAL_NEW_PARTY);

  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [pricingPlans, setPricingPlans] = useState([]);
  const [pricingPlanId, setPricingPlanId] = useState("");

  const [billingData, setBillingData] = useState({
    dueDate: "",
    discountAmount: "",
    discountReason: "",
    notes: "",
  });

  useEffect(() => {
    let ignore = false;

    async function loadBaseData() {
      try {
        const [studentsResponse, coursesResponse] = await Promise.all([
          apiFetch("/api/admin/students"),
          apiFetch("/api/admin/courses"),
        ]);

        if (ignore) return;

        setStudents(Array.isArray(studentsResponse) ? studentsResponse.filter((s) => s.status === "active") : []);
        setCourses(Array.isArray(coursesResponse) ? coursesResponse.filter((c) => c.status === "active") : []);
      } catch (requestError) {
        if (!ignore) {
          console.error("[ContractCreationModal] erro ao carregar dados base:", requestError);
        }
      }
    }

    loadBaseData();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!courseId) {
      setPricingPlans([]);
      setPricingPlanId("");
      return;
    }

    let ignore = false;

    async function loadPlans() {
      try {
        const response = await apiFetch(`/api/admin/courses/${courseId}/pricing-plans`);

        if (!ignore) {
          setPricingPlans(Array.isArray(response) ? response : []);
        }
      } catch (requestError) {
        if (!ignore) {
          console.error("[ContractCreationModal] erro ao carregar planos:", requestError);
        }
      }
    }

    loadPlans();

    return () => {
      ignore = true;
    };
  }, [courseId]);

  useEffect(() => {
    if (contractingPartyMode !== "existing" || !partySearchTerm.trim()) {
      setPartySearchResults([]);
      return;
    }

    let ignore = false;
    const timeoutId = setTimeout(async () => {
      try {
        const response = await searchContractingParties(partySearchTerm);

        if (!ignore) {
          setPartySearchResults(response?.data || []);
        }
      } catch (requestError) {
        console.error("[ContractCreationModal] erro ao buscar contratantes:", requestError);
      }
    }, 350);

    return () => {
      ignore = true;
      clearTimeout(timeoutId);
    };
  }, [contractingPartyMode, partySearchTerm]);

  const selectedPlan = pricingPlans.find((plan) => String(plan.id) === String(pricingPlanId));
  const selectedCourse = courses.find((course) => String(course.id) === String(courseId));
  const selectedStudent = students.find((student) => String(student.id) === String(existingStudentId));

  function validateStep(currentStep) {
    if (currentStep === 1) {
      if (studentMode === "existing" && !existingStudentId) {
        return "Selecione um aluno existente.";
      }

      if (studentMode === "new") {
        if (!newStudentData.name.trim() || !newStudentData.email.trim() || !newStudentData.birth_date || !newStudentData.cpf.trim()) {
          return "Preencha nome, e-mail, data de nascimento e CPF do novo aluno.";
        }
      }
    }

    if (currentStep === 2) {
      if (contractingPartyMode === "existing" && !existingPartyId) {
        return "Selecione um contratante existente.";
      }

      if (contractingPartyMode === "new") {
        if (!newPartyData.name.trim() || !newPartyData.document_number.trim() || !newPartyData.email.trim()) {
          return "Preencha nome, documento e e-mail do contratante.";
        }
      }
    }

    if (currentStep === 3) {
      if (!courseId) return "Selecione um curso.";
      if (!pricingPlanId) return "Selecione um plano de preço.";
    }

    if (currentStep === 4) {
      if (!billingData.dueDate) return "Informe a data de vencimento da primeira cobrança.";
    }

    return "";
  }

  function handleNext() {
    const validationError = validateStep(step);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setStep((current) => Math.min(current + 1, STEPS.length));
  }

  function handleBack() {
    setError("");
    setStep((current) => Math.max(current - 1, 1));
  }

  async function handleSubmit() {
    if (loading) return;

    try {
      setLoading(true);
      setError("");

      const payload = {
        contractingPartyMode,
        courseId: Number(courseId),
        pricingPlanId: Number(pricingPlanId),
        billingData: {
          dueDate: billingData.dueDate,
          discountAmount: billingData.discountAmount ? Number(billingData.discountAmount) : undefined,
          discountReason: billingData.discountReason || undefined,
          notes: billingData.notes || undefined,
        },
      };

      if (studentMode === "existing") {
        payload.existingStudentId = Number(existingStudentId);
      } else {
        payload.newStudentData = newStudentData;
      }

      if (contractingPartyMode === "existing") {
        payload.contractingPartyId = Number(existingPartyId);
        payload.contractingPartyData = { relationshipType: newPartyData.relationshipType };
      } else if (contractingPartyMode === "new") {
        payload.contractingPartyData = newPartyData;
      }

      const result = await createFinancialContract(payload);

      setSuccessResult(result.data);
    } catch (requestError) {
      setError(requestError.message || "Erro ao criar contrato.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200";
  const labelClass = "block text-sm font-medium text-gray-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleCloseModal}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
        >
          ✕
        </button>

        {successResult ? (
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <h2 className="text-2xl font-bold text-gray-900">Contrato criado com sucesso</h2>

            <div className="mt-6 space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm">
              <p><span className="font-medium">Status:</span> Aguardando pagamento</p>
              <p><span className="font-medium">Contrato:</span> #{successResult.contractId}</p>
              <p><span className="font-medium">Primeira fatura:</span> #{successResult.invoiceId}</p>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              A matrícula ainda não foi criada. Ela será criada automaticamente após a confirmação do
              pagamento, e o convite de acesso ao sistema será enviado ao aluno neste momento.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onSuccess?.(successResult)}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
              >
                Ver lista de contratos
              </button>

              <button
                type="button"
                onClick={handleCloseModal}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-14">
              <h2 className="text-xl font-bold text-gray-900">
                {entryPoint === "enrollments" ? "Nova matrícula comercial" : "Novo contrato"}
              </h2>

              <div className="mt-3 flex flex-wrap gap-2">
                {STEPS.map((label, index) => (
                  <span
                    key={label}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      index + 1 === step
                        ? "bg-blue-600 text-white"
                        : index + 1 < step
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {index + 1}. {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setStudentMode("existing")}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium ${
                        studentMode === "existing" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"
                      }`}
                    >
                      Aluno existente
                    </button>
                    <button
                      type="button"
                      onClick={() => setStudentMode("new")}
                      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium ${
                        studentMode === "new" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"
                      }`}
                    >
                      Novo aluno
                    </button>
                  </div>

                  {studentMode === "existing" ? (
                    <label className={labelClass}>
                      Aluno
                      <select
                        value={existingStudentId}
                        onChange={(event) => setExistingStudentId(event.target.value)}
                        className={inputClass}
                      >
                        <option value="">Selecione um aluno</option>
                        {students.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.name} · {student.registration_number}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <>
                      <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
                        A conta será criada como pendente de ativação — sem senha. O aluno recebe um
                        convite para definir a própria senha somente após a confirmação do pagamento.
                      </p>

                      <label className={labelClass}>
                        Nome
                        <input
                          value={newStudentData.name}
                          onChange={(e) => setNewStudentData((p) => ({ ...p, name: e.target.value }))}
                          className={inputClass}
                        />
                      </label>

                      <label className={labelClass}>
                        E-mail de acesso
                        <input
                          type="email"
                          value={newStudentData.email}
                          onChange={(e) => setNewStudentData((p) => ({ ...p, email: e.target.value }))}
                          className={inputClass}
                        />
                      </label>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label className={labelClass}>
                          Data de nascimento
                          <input
                            type="date"
                            value={newStudentData.birth_date}
                            onChange={(e) => setNewStudentData((p) => ({ ...p, birth_date: e.target.value }))}
                            className={inputClass}
                          />
                        </label>

                        <label className={labelClass}>
                          CPF
                          <input
                            value={newStudentData.cpf}
                            onChange={(e) => setNewStudentData((p) => ({ ...p, cpf: e.target.value }))}
                            className={inputClass}
                          />
                        </label>
                      </div>

                      <label className={labelClass}>
                        Telefone
                        <input
                          value={newStudentData.phone}
                          onChange={(e) => setNewStudentData((p) => ({ ...p, phone: e.target.value }))}
                          className={inputClass}
                        />
                      </label>
                    </>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setContractingPartyMode(contractingPartyMode === "self" ? "new" : "self")}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium ${
                      contractingPartyMode === "self" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"
                    }`}
                  >
                    {contractingPartyMode === "self" ? "✓ " : ""}O aluno é o próprio responsável financeiro
                  </button>

                  {contractingPartyMode !== "self" && (
                    <>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setContractingPartyMode("existing")}
                          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium ${
                            contractingPartyMode === "existing" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"
                          }`}
                        >
                          Contratante existente
                        </button>
                        <button
                          type="button"
                          onClick={() => setContractingPartyMode("new")}
                          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium ${
                            contractingPartyMode === "new" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600"
                          }`}
                        >
                          Novo contratante
                        </button>
                      </div>

                      {contractingPartyMode === "existing" && (
                        <div>
                          <label className={labelClass}>
                            Buscar por nome, documento ou e-mail
                            <input
                              value={partySearchTerm}
                              onChange={(e) => setPartySearchTerm(e.target.value)}
                              className={inputClass}
                            />
                          </label>

                          {partySearchResults.length > 0 && (
                            <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-200">
                              {partySearchResults.map((party) => (
                                <li key={party.id}>
                                  <button
                                    type="button"
                                    onClick={() => setExistingPartyId(String(party.id))}
                                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                                      String(party.id) === existingPartyId ? "bg-blue-50 text-blue-700" : "text-gray-700"
                                    }`}
                                  >
                                    {party.name} · {party.documentNumber}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {contractingPartyMode === "new" && (
                        <>
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className={labelClass}>
                              Tipo
                              <select
                                value={newPartyData.party_type}
                                onChange={(e) => setNewPartyData((p) => ({ ...p, party_type: e.target.value }))}
                                className={inputClass}
                              >
                                <option value="individual">Pessoa física</option>
                                <option value="company">Empresa</option>
                              </select>
                            </label>

                            <label className={labelClass}>
                              Relação com o aluno
                              <select
                                value={newPartyData.relationshipType}
                                onChange={(e) => setNewPartyData((p) => ({ ...p, relationshipType: e.target.value }))}
                                className={inputClass}
                              >
                                {RELATIONSHIP_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <label className={labelClass}>
                            Nome
                            <input
                              value={newPartyData.name}
                              onChange={(e) => setNewPartyData((p) => ({ ...p, name: e.target.value }))}
                              className={inputClass}
                            />
                          </label>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className={labelClass}>
                              Tipo de documento
                              <select
                                value={newPartyData.document_type}
                                onChange={(e) => setNewPartyData((p) => ({ ...p, document_type: e.target.value }))}
                                className={inputClass}
                              >
                                <option value="cpf">CPF</option>
                                <option value="cnpj">CNPJ</option>
                                <option value="other">Outro</option>
                              </select>
                            </label>

                            <label className={labelClass}>
                              Documento
                              <input
                                value={newPartyData.document_number}
                                onChange={(e) => setNewPartyData((p) => ({ ...p, document_number: e.target.value }))}
                                className={inputClass}
                              />
                            </label>
                          </div>

                          <label className={labelClass}>
                            E-mail de cobrança
                            <input
                              type="email"
                              value={newPartyData.email}
                              onChange={(e) => setNewPartyData((p) => ({ ...p, email: e.target.value }))}
                              className={inputClass}
                            />
                          </label>

                          <label className={labelClass}>
                            Telefone
                            <input
                              value={newPartyData.phone}
                              onChange={(e) => setNewPartyData((p) => ({ ...p, phone: e.target.value }))}
                              className={inputClass}
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <label className={labelClass}>
                    Curso
                    <select
                      value={courseId}
                      onChange={(e) => setCourseId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Selecione um curso</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={labelClass}>
                    Plano de preço
                    <select
                      value={pricingPlanId}
                      onChange={(e) => setPricingPlanId(e.target.value)}
                      disabled={!courseId}
                      className={inputClass}
                    >
                      <option value="">
                        {!courseId ? "Selecione um curso primeiro" : "Selecione um plano"}
                      </option>
                      {pricingPlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} — {formatCurrency(plan.total_amount)}
                        </option>
                      ))}
                    </select>

                    {courseId && pricingPlans.length === 0 && (
                      <p className="mt-2 text-xs font-medium text-red-600">
                        Este curso não possui plano de preço ativo.
                      </p>
                    )}
                  </label>

                  {selectedPlan && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
                      <p className="font-semibold text-gray-900">{formatCurrency(selectedPlan.total_amount)}</p>
                      {selectedPlan.billing_type === "monthly_plan" && (
                        <p className="text-gray-600">
                          {selectedPlan.monthly_payment_count}x de {formatCurrency(selectedPlan.monthly_payment_amount)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <label className={labelClass}>
                    Vencimento da primeira cobrança
                    <input
                      type="date"
                      value={billingData.dueDate}
                      onChange={(e) => setBillingData((p) => ({ ...p, dueDate: e.target.value }))}
                      className={inputClass}
                    />
                  </label>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label className={labelClass}>
                      Desconto (opcional)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={billingData.discountAmount}
                        onChange={(e) => setBillingData((p) => ({ ...p, discountAmount: e.target.value }))}
                        className={inputClass}
                      />
                    </label>

                    <label className={labelClass}>
                      Motivo do desconto
                      <input
                        value={billingData.discountReason}
                        onChange={(e) => setBillingData((p) => ({ ...p, discountReason: e.target.value }))}
                        disabled={!billingData.discountAmount}
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <label className={labelClass}>
                    Observações
                    <textarea
                      value={billingData.notes}
                      onChange={(e) => setBillingData((p) => ({ ...p, notes: e.target.value }))}
                      rows="3"
                      className={inputClass}
                    />
                  </label>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-400">Aluno</p>
                    <p className="mt-1 text-sm text-gray-800">
                      {studentMode === "existing" ? selectedStudent?.name : newStudentData.name}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-400">Contratante</p>
                    <p className="mt-1 text-sm text-gray-800">
                      {contractingPartyMode === "self"
                        ? "O próprio aluno"
                        : contractingPartyMode === "existing"
                          ? partySearchResults.find((p) => String(p.id) === existingPartyId)?.name || `#${existingPartyId}`
                          : newPartyData.name}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-400">Curso e plano</p>
                    <p className="mt-1 text-sm text-gray-800">
                      {selectedCourse?.name} — {selectedPlan?.name} ({formatCurrency(selectedPlan?.total_amount)})
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-semibold uppercase text-gray-400">Primeira cobrança</p>
                    <p className="mt-1 text-sm text-gray-800">Vencimento: {billingData.dueDate}</p>
                    {billingData.discountAmount && (
                      <p className="text-sm text-gray-800">Desconto: {formatCurrency(billingData.discountAmount)}</p>
                    )}
                  </div>

                  <p className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
                    O aluno e o contrato serão criados agora. A matrícula e o acesso ao sistema só serão
                    liberados após a confirmação do pagamento desta primeira fatura.
                  </p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 flex justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
              <button
                type="button"
                onClick={step === 1 ? handleCloseModal : handleBack}
                disabled={loading}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
              >
                {step === 1 ? "Cancelar" : "Voltar"}
              </button>

              {step < STEPS.length ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700"
                >
                  Continuar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {loading ? "Criando..." : "Criar contrato e gerar fatura"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
