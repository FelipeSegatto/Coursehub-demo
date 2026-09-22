import { useEffect, useState } from "react";
import { apiFetch } from "./APIService";

export default function useEnrollment() {
  const [matriculas, setMatriculas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let componenteMontado = true;

    async function fetchMatriculas() {
      try {
        setLoading(true);
        setError(null);

        const dados = await apiFetch(
          "/api/students/me/courses"
        );

        console.log("Cursos matriculados:", dados);

        if (!componenteMontado) {
          return;
        }

        if (Array.isArray(dados)) {
          setMatriculas(dados);
        } else if (Array.isArray(dados.courses)) {
          setMatriculas(dados.courses);
        } else if (Array.isArray(dados.cursos)) {
          setMatriculas(dados.cursos);
        } else {
          setMatriculas([]);
        }
      } catch (error) {
        console.error(
          "Erro ao buscar cursos matriculados:",
          error
        );

        if (!componenteMontado) {
          return;
        }

        setError(
          error.message ||
            "Não foi possível carregar seus cursos."
        );

        setMatriculas([]);
      } finally {
        if (componenteMontado) {
          setLoading(false);
        }
      }
    }

    fetchMatriculas();

    return () => {
      componenteMontado = false;
    };
  }, []);

  return {
    matriculas,
    loading,
    error,
  };
}