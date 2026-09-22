import { useState, useEffect } from "react";
import { apiFetch } from "./APIService";

export default function CourseService() {
    const [cursosAPI, setCursosAPI] = useState([]);
    
    useEffect(() => {
      async function fetchCursos() {
        try {
          const dados = await apiFetch("/api/courses");
    
          setCursosAPI(Array.isArray(dados) ? dados : []);
        } catch (error) {
          console.error("Erro ao buscar cursos:", error);
          setCursosAPI([]);
        }
      }
    
      fetchCursos();
    }, []);
    return cursosAPI;
}