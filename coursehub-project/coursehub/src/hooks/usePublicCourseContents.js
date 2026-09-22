import { useState, useEffect } from "react";
import { apiFetch } from "../services/APIService";

/*
 * Conteúdos GERAIS (class_id NULL) de um curso, via rota pública
 * GET /api/courses/:id/contents — nunca inclui conteúdo exclusivo
 * de turma. Para conteúdo de um aluno autenticado (geral + da
 * turma da matrícula), use a rota autenticada
 * GET /api/students/courses/:courseId/contents diretamente.
 */
export default function usePublicCourseContents(id) {
    const [contentsAPI, setContentAPI] = useState([]);

    useEffect(() => {
      async function fetchContents() {
        try {
          const dados = await apiFetch(`/api/courses/${id}/contents`);

          setContentAPI(Array.isArray(dados) ? dados : []);
        } catch (error) {
          console.error("Erro ao buscar cursos:", error);
          setContentAPI([]);
        }
      }

      fetchContents();
    }, [id]);
    return contentsAPI;
}
