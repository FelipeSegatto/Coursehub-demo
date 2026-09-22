import { CalendarDays, Mail } from "lucide-react";
import { resolveAvatarSrc } from "../../data/profileAvatars";

const roleLabels = {
  admin: "Administrador",
  manager: "Gerente",
  teacher: "Professor",
  student: "Aluno",
  staff: "Colaborador",
};

const statusLabels = {
  active: "Ativo",
  inactive: "Inativo",
  blocked: "Bloqueado",
  graduated: "Formado",
  cancelled: "Cancelado",
};

function formatDate(date) {
  if (!date) {
    return "Data não informada";
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Data não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsedDate);
}

function ProfileHeaderCard({ profile }) {
  const avatar = resolveAvatarSrc({
    avatarKey: profile.avatarKey,
    gender: profile.gender,
    avatarFileId: profile.avatarFileId,
  });

  const status =
    profile.details?.status ||
    profile.accountStatus ||
    profile.status;

  const isActive = status === "active";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <div className="shrink-0">
          <img
            src={avatar.src}
            alt={avatar.alt || `Avatar de ${profile.name}`}
            className="h-24 w-24 rounded-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(event) => {
              console.error(
                "Erro ao carregar avatar:",
                event.currentTarget.src
              );
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="truncate text-2xl font-semibold text-slate-900">
              {profile.name}
            </h2>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {roleLabels[profile.role] || profile.role}
            </span>

            {status && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {statusLabels[status] || status}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:flex-wrap sm:gap-5">
            <span className="flex items-center gap-2">
              <Mail size={16} />
              {profile.email}
            </span>

            <span className="flex items-center gap-2">
              <CalendarDays size={16} />
              Membro desde {formatDate(profile.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProfileHeaderCard;