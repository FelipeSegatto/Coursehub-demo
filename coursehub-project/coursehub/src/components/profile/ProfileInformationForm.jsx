import { useEffect, useState } from "react";
import { LockKeyhole, Save } from "lucide-react";

const statusLabels = {
  active: "Ativo",
  inactive: "Inativo",
  graduated: "Formado",
  cancelled: "Cancelado",
  blocked: "Bloqueado",
};

function ReadOnlyField({ label, value, helperText }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-500">
        <LockKeyhole size={15} />

        <span>{value || "Não informado"}</span>
      </div>

      {helperText && (
        <p className="mt-1.5 text-xs text-slate-400">{helperText}</p>
      )}
    </div>
  );
}

function InputField({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
}) {
  return (
    <div>
      <label
        htmlFor={`profile-${name}`}
        className="mb-2 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>

      <input
        id={`profile-${name}`}
        name={name}
        type={type}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  );
}

function formatCpf(cpf) {
  if (!cpf) {
    return "Não informado";
  }

  const digits = cpf.replace(/\D/g, "");

  if (digits.length !== 11) {
    return cpf;
  }

  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function formatDate(date) {
  if (!date) {
    return "Não informada";
  }

  const parsedDate = new Date(`${date}`.slice(0, 10) + "T00:00:00");

  return new Intl.DateTimeFormat("pt-BR").format(parsedDate);
}

function ProfileInformationForm({
  profile,
  onSave,
  isSaving,
  message,
  error,
}) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gender: "",
    phone: "",
    address: "",
    specialty: "",
  });

  useEffect(() => {
    setFormData({
      name: profile.name || "",
      email: profile.email || "",
      gender: profile.gender || "",
      phone: profile.details?.phone || "",
      address: profile.details?.address || "",
      specialty: profile.details?.specialty || "",
    });
  }, [profile]);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSave(formData);
  }

  const institutionalStatus =
    profile.details?.status || profile.accountStatus || profile.status;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">
          Informações pessoais
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Atualize os dados permitidos para o seu perfil.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-5 md:grid-cols-2">
          <InputField
            label="Nome completo"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />

          <InputField
            label="E-mail"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
          />

          {profile.role !== "admin" && (
            <InputField
              label="Telefone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="(00) 00000-0000"
            />
          )}

          <div>
            <label
              htmlFor="profile-gender"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Gênero
            </label>

            <select
              id="profile-gender"
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            >
              <option value="">Prefiro não informar</option>
              <option value="male">Masculino</option>
              <option value="female">Feminino</option>
              <option value="non_binary">Não binário</option>
              <option value="other">Outro</option>
            </select>
          </div>

          {profile.role === "student" && (
            <div className="md:col-span-2">
              <InputField
                label="Endereço"
                name="address"
                value={formData.address}
                onChange={handleChange}
                placeholder="Informe seu endereço"
              />
            </div>
          )}

          {profile.role === "teacher" && (
            <InputField
              label="Especialidade"
              name="specialty"
              value={formData.specialty}
              onChange={handleChange}
              placeholder="Ex.: Língua Inglesa"
            />
          )}
        </div>

        {(profile.role === "student" || profile.role === "teacher") && (
          <>
            <div className="my-7 border-t border-slate-100" />

            <div className="mb-5">
              <h3 className="font-semibold text-slate-900">
                Informações institucionais
              </h3>

              <p className="mt-1 text-sm text-slate-500">
                Esses dados são gerenciados pela instituição.
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <ReadOnlyField
                label="Número de matrícula"
                value={profile.details?.registrationNumber}
                helperText="Gerenciado pela instituição"
              />

              <ReadOnlyField
                label="CPF"
                value={formatCpf(profile.details?.cpf)}
                helperText="Exibido de forma protegida"
              />

              {profile.role === "student" && (
                <ReadOnlyField
                  label="Data de nascimento"
                  value={formatDate(profile.details?.birthDate)}
                  helperText="Gerenciada pela instituição"
                />
              )}

              <ReadOnlyField
                label="Status"
                value={
                  statusLabels[institutionalStatus] || institutionalStatus
                }
                helperText="Gerenciado pela instituição"
              />
            </div>
          </>
        )}

        {message && (
          <p
            role="status"
            className="mt-6 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          >
            {message}
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save size={17} />

            {isSaving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default ProfileInformationForm;