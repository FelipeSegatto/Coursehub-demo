import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";
import LessonPlayer from "../../components/LessonPlayer";

const categories = [
  { type: "video", label: "Vídeo aulas" },
  { type: "pdf", label: "PDFs / Apostilas" },
  { type: "text", label: "Conteúdo em texto" },
  { type: "live_class", label: "Aulas ao vivo" },
];

const contentTypeLabels = {
  video: "Vídeo aula",
  pdf: "PDF / Apostila",
  text: "Conteúdo em texto",
  live_class: "Aula ao vivo",
};

export default function MaterialPlayer() {
  const { classId } = useParams();
  const Navigate = useNavigate();
  const { usuarioLogado } = useAuth();

  const [classInfo, setClassInfo] = useState(null);
  const [allContents, setAllContents] = useState([]);
  const [selectedContent, setSelectedContent] = useState(null);
  const [selectedType, setSelectedType] = useState("video");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!usuarioLogado?.id) return;

    async function fetchClassContents() {
      try {
        setLoading(true);
        setError("");

        let data;
        try {
          data = await apiFetch(
            `/api/teacher/by-user/${usuarioLogado.id}/classes/${classId}/contents?status=active`
          );
        } catch (contentsRequestError) {
          throw new Error(
            contentsRequestError.data?.message ||
              "Turma não encontrada ou não vinculada ao professor.",
            { cause: contentsRequestError }
          );
        }

        const contentsData = (Array.isArray(data?.contents) ? data.contents : []).filter(
          (content) => !content.status || content.status === "active"
        );

        setClassInfo(data?.class || null);
        setAllContents(contentsData);

        const firstVideo = contentsData.find((content) => content.type === "video");
        const firstContent = firstVideo || contentsData[0] || null;

        setSelectedContent(firstContent);

        if (firstContent) {
          setSelectedType(firstContent.type);
        }
      } catch (error) {
        console.error("Erro ao buscar conteúdos da turma:", error);

        setClassInfo(null);
        setAllContents([]);
        setSelectedContent(null);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    fetchClassContents();
  }, [classId, usuarioLogado?.id]);

  const filteredContents = allContents.filter(
    (content) => content.type === selectedType
  );

  const currentIndex = filteredContents.findIndex(
    (content) => content.id === selectedContent?.id
  );

  const isVideoTab = selectedType === "video";
  const isFirstContent = currentIndex <= 0;
  const isLastContent = currentIndex === filteredContents.length - 1;

  function handleSelectCategory(type) {
    setSelectedType(type);

    const firstContentOfType = allContents.find(
      (content) => content.type === type
    );

    setSelectedContent(firstContentOfType || null);
  }

  function handlePreviousContent() {
    if (!isVideoTab || isFirstContent) return;

    setSelectedContent(filteredContents[currentIndex - 1]);
  }

  function handleNextContent() {
    if (!isVideoTab || isLastContent) return;

    setSelectedContent(filteredContents[currentIndex + 1]);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900">
          Carregando materiais...
        </h1>
      </main>
    );
  }

  if (!classInfo) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900">
          Turma não encontrada
        </h1>

        {error && <p className="mt-4 text-red-600">{error}</p>}

        <button
            onClick={() => Navigate(-1)}

          className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 transition"
        >
          Voltar para a página anterior
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <button
        onClick={() => Navigate(-1)}
        className="text-sm font-semibold text-blue-600 hover:text-blue-700"
      >
        ← Voltar para a página anterior
      </button>


      <h1 className="mt-6 text-5xl font-bold text-gray-900">
        {classInfo.courseTitle}
      </h1>

      <p className="mt-2 text-lg text-gray-500">
        Turma: {classInfo.name}
      </p>

      <section className="mt-10 flex gap-8">
        <div className="flex-[1.5] rounded-2xl border border-gray-200 p-6">
          <LessonPlayer lesson={selectedContent} />

          {isVideoTab && filteredContents.length > 0 && (
            <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6">
              <button
                onClick={handlePreviousContent}
                disabled={isFirstContent}
                className={`rounded-xl px-5 py-3 font-semibold transition ${
                  isFirstContent
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                ← Aula anterior
              </button>

              <span className="text-sm font-semibold text-gray-600">
                Aula {currentIndex + 1} de {filteredContents.length}
              </span>

              <button
                onClick={handleNextContent}
                disabled={isLastContent}
                className={`rounded-xl px-5 py-3 font-semibold transition ${
                  isLastContent
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Próxima aula →
              </button>
            </div>
          )}
        </div>

        <aside className="flex-1 rounded-2xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900">
            Conteúdo da turma
          </h2>

          <nav className="mt-5 grid grid-cols-2 gap-3">
            {categories.map((category) => (
              <button
                key={category.type}
                onClick={() => handleSelectCategory(category.type)}
                className={`rounded-xl border p-3 text-sm font-semibold transition ${
                  selectedType === category.type
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {category.label}
              </button>
            ))}
          </nav>

          <div className="mt-6 space-y-2">
            {filteredContents.length === 0 && (
              <p className="rounded-xl border border-gray-200 p-4 text-gray-500">
                Nenhum conteúdo cadastrado nesta categoria.
              </p>
            )}

            {filteredContents.map((content) => (
              <button
                key={content.id}
                onClick={() => setSelectedContent(content)}
                className={`block w-full rounded-xl border p-3 text-left transition ${
                  selectedContent?.id === content.id
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <span className="block font-semibold">{content.title}</span>

                <span className="mt-1 block text-xs text-gray-500">
                  {contentTypeLabels[content.type] || content.type}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
