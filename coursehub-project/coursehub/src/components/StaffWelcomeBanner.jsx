import { Link } from "react-router-dom";
import HeroGreetingsText from "./HeroGreetingsText";

function todayLabel() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export default function StaffWelcomeBanner({
  eyebrow,
  title,
  description,
  statusMessage,
  action,
  image = "/images/coursehub-hero-green.webp",
  imageAlt = "",
}) {
  const dateLabel = todayLabel();

  return (
    <div className="relative mb-10 min-h-[300px] overflow-hidden rounded-[28px] bg-slate-950 shadow-sm sm:min-h-[340px]">
      <img
        src={image}
        alt={imageAlt}
        fetchPriority="high"
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-80"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/78 to-slate-950/25" />
      <div className="absolute inset-y-0 left-0 w-1.5 bg-blue-600" />

      <div className="relative flex min-h-[300px] flex-col justify-end p-7 sm:min-h-[340px] sm:p-10">
        <div className="flex flex-wrap items-center gap-3">
          {eyebrow && (
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
              {eyebrow}
            </span>
          )}
          <p className="text-sm font-medium capitalize text-white/70">{dateLabel}</p>
        </div>

        {title ? (
          <div className="mt-4 mb-0">
            <h1 className="max-w-3xl text-4xl font-bold text-white">{title}</h1>
            {description && (
              <p className="mt-3 max-w-2xl text-white/80">{description}</p>
            )}
          </div>
        ) : (
          <HeroGreetingsText
            className="mt-4 mb-0"
            titleClassName="text-white"
            descriptionClassName="text-white/80"
            description={description}
          />
        )}

        <div className="mt-6 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end">
          {statusMessage && (
            <p className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">
              {statusMessage}
            </p>
          )}

          {action?.to && (
            <Link
              to={action.to}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              {action.label}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}