import { Link } from "react-router-dom";
import { publicImageUrl } from "../utils/publicImageUrl";

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * course_pricing_plans é a única fonte de preço comercial -- nunca
 * course.price (mantido no banco só por compatibilidade, nunca
 * usado aqui, nem como fallback). Sem plano ativo, mostramos
 * "Consulte os valores" em vez de omitir o preço silenciosamente.
 */
function PriceDisplay({ pricing }) {
  if (!pricing?.hasActivePlans) {
    return <span className="text-sm font-semibold text-gray-500">Consulte os valores</span>;
  }

  return (
    <div>
      <strong className="block text-base text-gray-950">
        Curso a partir de {formatCurrency(pricing.startingPrice)}
      </strong>

      {pricing.monthlyPaymentFrom !== null && (
        <span className="block text-xs text-gray-500">
          Mensalidades a partir de {formatCurrency(pricing.monthlyPaymentFrom)}
        </span>
      )}
    </div>
  );
}

export default function CardCourses({ course }) {
  return (
    <article
      className="
        group
        flex
        h-full
        min-h-[390px]
        flex-col
        overflow-hidden
        rounded-2xl
        border
        border-white/60
        bg-white/65
        shadow-[0_12px_35px_rgba(15,23,42,0.08)]
        backdrop-blur-xl
        transition-all
        duration-300
        hover:-translate-y-1
        hover:border-white/80
        hover:bg-white/75
        hover:shadow-[0_18px_45px_rgba(15,23,42,0.13)]
      "
    >
      <div className="aspect-[16/9] w-full overflow-hidden bg-gray-100">
        <img
          src={publicImageUrl(course.image_url)}
          alt={course.name}
          loading="lazy"
          decoding="async"
          className="
            h-full
            w-full
            object-cover
            transition-transform
            duration-500
            group-hover:scale-105
          "
          onError={(event) => {
            event.currentTarget.src = "/images/default-course.webp";
          }}
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="min-h-6">
          {course.category && (
            <span className="text-sm font-semibold text-blue-600">
              {course.category}
            </span>
          )}
        </div>

        <h2
          className="
            mt-2
            min-h-14
            line-clamp-2
            text-xl
            font-semibold
            leading-7
            text-gray-950
          "
        >
          {course.name}
        </h2>

        <p
          className="
            mt-2
            min-h-12
            line-clamp-2
            text-sm
            leading-6
            text-gray-600
          "
        >
          {course.description || "Informações do curso disponíveis em breve."}
        </p>

        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <span>{course.nivel || "Nível não informado"}</span>

          <span>
            {course.workload_hours
              ? `${course.workload_hours}h`
              : "Carga horária não informada"}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <PriceDisplay pricing={course.pricing} />

          <Link
            to={`/courses/${course.id}`}
            className="
              shrink-0
              text-sm
              font-semibold
              text-blue-600
              transition-colors
              hover:text-blue-800
            "
          >
            Acessar →
          </Link>
        </div>
      </div>
    </article>
  );
}
