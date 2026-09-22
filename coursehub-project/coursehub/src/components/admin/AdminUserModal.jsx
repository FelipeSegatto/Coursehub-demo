import { useState } from "react";
import { createUser, updateUser } from "../../services/AdminUserService";

// manager/staff existem no enum do banco, mas não têm suporte
// funcional completo ainda -- nunca expostos aqui, só os três papéis
// com fluxo de criação real (ver adminUserService#createUser).
const ROLE_OPTIONS = [
  { value: "student", label: "Aluno" },
  { value: "teacher", label: "Professor" },
  { value: "admin", label: "Administrador" },
];

const INITIAL_FORM = {
  name: "",
  email: "",
  gender: "Masculino",
  password: "",
  confirmPassword: "",
  status: "active",
  // Campos específicos de professor
  specialty: "",
  cpf: "",
  phone: "",
  // Campos específicos de aluno (cpf/phone compartilhados com professor)
  birth_date: "",
  address: "",
};

function AdminUserModal({ mode = "create", initialData = null, handleCloseModal, onSuccess }) {
  const isEditMode = mode === "edit";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [role, setRole] = useState("student");

  const [formData, setFormData] = useState({
    ...INITIAL_FORM,
    name: initialData?.name || "",
    email: initialData?.email || "",
    gender: initialData?.gender || "Masculino",
    status: initialData?.status || "active",
  });

  const isTeacherRole = role === "teacher";
  const isStudentRole = role === "student";

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({ ...previous, [name]: value }));
  }

  function validateForm() {
    if (!formData.name.trim()) {
      return "Nome é obrigatório.";
    }

    if (!formData.email.trim()) {
      return "E-mail é obrigatório.";
    }

    if (!isEditMode) {
      if (!ROLE_OPTIONS.some((option) => option.value === role)) {
        return "Selecione o papel do novo usuário.";
      }

      if (!formData.password || !formData.confirmPassword) {
        return "Senha e confirmação de senha são obrigatórias.";
      }

      if (formData.password !== formData.confirmPassword) {
        return "As senhas não coincidem.";
      }

      if (formData.password.length < 6) {
        return "A senha deve ter pelo menos 6 caracteres.";
      }

      if (isStudentRole && (!formData.birth_date || !formData.cpf.trim() || !formData.phone.trim())) {
        return "Data de nascimento, CPF e telefone são obrigatórios para alunos.";
      }
    }

    return "";
  }

  function buildCreatePayload() {
    const basePayload = {
      role,
      name: formData.name.trim(),
      email: formData.email.trim(),
      password: formData.password,
      status: formData.status,
    };

    if (role === "admin") {
      return basePayload;
    }

    if (role === "teacher") {
      return {
        ...basePayload,
        gender: formData.gender,
        specialty: formData.specialty.trim() || null,
        cpf: formData.cpf.trim() || null,
        phone: formData.phone.trim() || null,
      };
    }

    // student
    return {
      ...basePayload,
      gender: formData.gender,
      birth_date: formData.birth_date,
      cpf: formData.cpf.trim(),
      phone: formData.phone.trim(),
      address: formData.address.trim() || null,
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

      const result = isEditMode
        ? await updateUser(initialData.id, {
            name: formData.name.trim(),
            email: formData.email.trim(),
            gender: formData.gender,
          })
        : await createUser(buildCreatePayload());

      await onSuccess?.(result);
    } catch (requestError) {
      console.error("Erro ao salvar usuário:", requestError);
      setError(requestError.message || "Erro ao salvar usuário.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";
  const labelClass = "block text-sm font-medium text-gray-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
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
            {isEditMode ? "Editar usuário" : "Cadastrar usuário"}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {isEditMode
              ? "Altera apenas os dados básicos de identidade — status, papel e senha são alterados pelas ações da tabela."
              : "Escolha o papel do novo usuário: aluno, professor ou administrador. Cada um cria o cadastro completo correspondente."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-6"
        >
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          {!isEditMode && (
            <label className={labelClass}>
              Papel
              <select
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className={inputClass}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className={labelClass}>
            Nome
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Ex: Sophia Fernandez"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            E-mail
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="sophia@email.com"
              className={inputClass}
            />
          </label>

          {isEditMode ? (
            <label className={labelClass}>
              Gênero
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="Masculino">Masculino</option>
                <option value="Feminino">Feminino</option>
                <option value="Outro">Outro</option>
              </select>
            </label>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className={labelClass}>
                  Senha
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    placeholder="Digite uma senha"
                    className={inputClass}
                  />
                </label>

                <label className={labelClass}>
                  Confirmar senha
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    required
                    placeholder="Confirme a senha"
                    className={inputClass}
                  />
                </label>
              </div>

              {(isTeacherRole || isStudentRole) && (
                <label className={labelClass}>
                  Gênero
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                  </select>
                </label>
              )}

              {isStudentRole && (
                <label className={labelClass}>
                  Data de nascimento
                  <input
                    type="date"
                    name="birth_date"
                    value={formData.birth_date}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </label>
              )}

              {isTeacherRole && (
                <label className={labelClass}>
                  Especialidade
                  <input
                    name="specialty"
                    value={formData.specialty}
                    onChange={handleChange}
                    placeholder="Ex: Front-end, UX/UI, Banco de Dados"
                    className={inputClass}
                  />
                </label>
              )}

              {(isTeacherRole || isStudentRole) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className={labelClass}>
                    CPF
                    <input
                      name="cpf"
                      value={formData.cpf}
                      onChange={handleChange}
                      required={isStudentRole}
                      placeholder="000.000.000-00"
                      className={inputClass}
                    />
                  </label>

                  <label className={labelClass}>
                    Telefone
                    <input
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required={isStudentRole}
                      placeholder="(00) 00000-0000"
                      className={inputClass}
                    />
                  </label>
                </div>
              )}

              {isStudentRole && (
                <label className={labelClass}>
                  Endereço
                  <input
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="Ex: Arapiraca - AL"
                    className={inputClass}
                  />
                </label>
              )}

              <label className={labelClass}>
                Status inicial
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </label>
            </>
          )}

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
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {loading ? "Salvando..." : isEditMode ? "Salvar alterações" : "Salvar usuário"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminUserModal;
