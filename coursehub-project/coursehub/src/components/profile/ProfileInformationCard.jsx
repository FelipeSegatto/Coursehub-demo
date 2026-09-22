const genderLabels = {
  male: "Masculino",
  female: "Feminino",
  non_binary: "Não binário",
  other: "Outro",

  // Compatibilidade com os dados atuais do banco
  Masculino: "Masculino",
  Feminino: "Feminino",
};

const statusLabels = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
  graduated: "Formado",
  cancelled: "Cancelado",
};

function InformationItem({
  label,
  value,
  className = "",
}) {
  return (
    <div className={className}>
      <dt className="text-sm py-1 font-medium text-slate-500">
        {label}
      </dt>

      <dd className="py-1 text-sm font-semibold text-slate-900">
        {value || "Não informado"}
      </dd>
    </div>
  );
}

function formatCpf(cpf) {
  if (!cpf) {
    return "Não informado";
  }

  const digits = String(cpf).replace(/\D/g, "");

  if (digits.length !== 11) {
    return cpf;
  }

  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function formatDate(date) {
  if (!date) {
    return "Não informada";
  }

  const normalizedDate = String(date).slice(0, 10);
  const parsedDate = new Date(`${normalizedDate}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Não informada";
  }

  return new Intl.DateTimeFormat("pt-BR").format(parsedDate);
}

function ProfileInformationCard({ profile }) {
  const details = profile.details || {};

  const institutionalStatus =
    details.status ||
    profile.accountStatus ||
    profile.status;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-900">
          Informações pessoais
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Dados cadastrados no seu perfil.
        </p>
      </div>

      <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        <InformationItem
          label="Nome completo"
          value={profile.name}
        />

        <InformationItem
          label="E-mail"
          value={profile.email}
        />

        <InformationItem
          label="Gênero"
          value={
            genderLabels[profile.gender] ||
            profile.gender
          }
        />

        {profile.role !== "admin" && (
          <InformationItem
            label="Telefone"
            value={details.phone}
          />
        )}

        {profile.role === "student" && (
          <InformationItem
            label="Endereço"
            value={details.address}
            className="md:col-span-2"
          />
        )}

        {profile.role === "teacher" && (
          <InformationItem
            label="Especialidade"
            value={details.specialty}
          />
        )}
      </dl>

      {(profile.role === "student" ||
        profile.role === "teacher") && (
        <>
          <div className="my-7 border-t border-slate-100" />

          <div className="mb-6">
            <h3 className="font-semibold text-slate-900">
              Informações institucionais
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Esses dados são gerenciados pela instituição.
            </p>
          </div>

          <dl className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <InformationItem
              label="Número de matrícula"
              value={details.registrationNumber}
            />

            <InformationItem
              label="CPF"
              value={formatCpf(details.cpf)}
            />

            {profile.role === "student" && (
              <InformationItem
                label="Data de nascimento"
                value={formatDate(details.birthDate)}
              />
            )}

            <InformationItem
              label="Status"
              value={
                statusLabels[institutionalStatus] ||
                institutionalStatus
              }
            />
          </dl>
        </>
      )}
    </section>
  );
}

export default ProfileInformationCard;