import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

export default function HeroGreetingsText({
  titleClassName = "",
  descriptionClassName = "",
  className = "mb-10",
  description = "Aprenda tecnologia, design e desenvolvimento web com cursos práticos, objetivos e focados em projetos reais.",
}) {
  const { usuarioLogado } = useAuth();

  const genero = usuarioLogado?.gender?.toLowerCase();

  const saudacao =
    genero === "feminino" ||
    genero === "female" ||
    genero === "f"
      ? "vinda"
      : "vindo";

  const fullText = useMemo(() => {
    if (!usuarioLogado?.name) return "";

    return `Bem ${saudacao}, ${usuarioLogado.name}!`;
  }, [saudacao, usuarioLogado?.name]);

  const [displayedText, setDisplayedText] =
    useState("");

  const [finished, setFinished] =
    useState(false);

  useEffect(() => {
    if (!fullText) return;

    setDisplayedText("");
    setFinished(false);

    let index = 0;

    const timeout = window.setTimeout(() => {
      const interval = window.setInterval(() => {
        index += 1;

        setDisplayedText(
          fullText.slice(0, index)
        );

        if (index >= fullText.length) {
          window.clearInterval(interval);

          window.setTimeout(() => {
            setFinished(true);
          }, 250);
        }
      }, 55);
    }, 200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [fullText]);

  return (
    <div className={className}>
      <h1
        className={`text-4xl font-bold ${titleClassName}`}
      >
        <span>{displayedText}</span>

        <span
          aria-hidden="true"
          className="
            ml-1
            inline-block
            h-[0.9em]
            w-[3px]
            translate-y-[0.08em]
            bg-pink-500
            animate-[heroCursorBlink_0.8s_steps(1)_infinite]
          "
        />
      </h1>

      <p
        className={`
          mt-3
          max-w-2xl
          transition-all
          duration-700
          ${
            finished
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0"
          }
          ${descriptionClassName}
        `}
      >
        {description}
      </p>
    </div>
  );
}