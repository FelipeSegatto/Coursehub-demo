import { useEffect, useState } from "react";
import { API_URL, apiFetchBlob } from "../services/APIService";

function getStoredFilePath(url = "") {
  if (!url) return "";

  if (url.startsWith("/api/files/")) {
    return url;
  }

  try {
    const parsed = new URL(url);

    if (parsed.pathname.startsWith("/api/files/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    return "";
  }

  return "";
}

function AuthenticatedFilePreview({ url, title }) {
  const filePath = getStoredFilePath(url);
  const [objectUrl, setObjectUrl] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [loading, setLoading] = useState(Boolean(filePath));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!filePath) return undefined;

    let cancelled = false;
    let createdUrl = "";

    async function loadFile() {
      try {
        setLoading(true);
        setError("");

        const { blob, mimeType: responseMime } = await apiFetchBlob(filePath);

        if (cancelled) return;

        createdUrl = URL.createObjectURL(blob);

        if (cancelled) {
          URL.revokeObjectURL(createdUrl);
          return;
        }

        setObjectUrl(createdUrl);
        setMimeType(responseMime || blob.type || "");
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Não foi possível abrir o arquivo.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadFile();

    return () => {
      cancelled = true;

      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [filePath]);

  if (!filePath) {
    return (
      <iframe
        src={getDrivePreviewUrl(url)}
        width="100%"
        title={title}
        className="h-[380px] w-full rounded-xl border sm:h-[520px]"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-[380px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500 sm:h-[520px]">
        Carregando arquivo...
      </div>
    );
  }

  if (error || !objectUrl) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error || "Não foi possível visualizar este arquivo."}
      </div>
    );
  }

  if (mimeType.startsWith("image/")) {
    return (
      <img
        src={objectUrl}
        alt={title}
        loading="lazy"
        decoding="async"
        className="max-h-[520px] w-full rounded-xl border border-gray-200 object-contain bg-gray-50"
      />
    );
  }

  return (
    <iframe
      src={objectUrl}
      title={title}
      className="h-[380px] w-full rounded-xl border sm:h-[520px]"
    />
  );
}

export default function LessonPlayer({ lesson }) {
  if (!lesson) {
    return (
      <div className="rounded-xl border border-gray-200 p-6">
        <p className="text-gray-600">Selecione um conteúdo para visualizar.</p>
      </div>
    );
  }

  if (lesson.type === "video") {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          {lesson.title}
        </h2>

        <div className="aspect-video w-full overflow-hidden rounded-xl border">
          <iframe
            width="100%"
            height="100%"
            src={getYoutubeEmbedUrl(lesson.content_url)}
            title={lesson.title}
            frameBorder="0"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      </div>
    );
  }

  if (lesson.type === "pdf") {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          {lesson.title}
        </h2>

        <AuthenticatedFilePreview
          url={lesson.content_url || lesson.contentUrl}
          title={lesson.title}
        />
      </div>
    );
  }

  if (lesson.type === "text") {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold text-gray-900">
          {lesson.title}
        </h2>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-gray-700">
          {lesson.content_text || lesson.description || "Texto não cadastrado."}
        </div>
      </div>
    );
  }

  return (
    <p className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-700">
      Tipo de conteúdo não reconhecido: {lesson.type}
    </p>
  );
}

function getYoutubeEmbedUrl(url = "") {
  if (!url) return "";

  if (url.includes("watch?v=")) {
    const videoId = url.split("v=")[1]?.split("&")[0];
    return `https://www.youtube.com/embed/${videoId}`;
  }

  if (url.includes("youtu.be/")) {
    const videoId = url.split("youtu.be/")[1]?.split("?")[0];
    return `https://www.youtube.com/embed/${videoId}`;
  }

  if (url.includes("/embed/")) {
    return url;
  }

  return "";
}

function getDrivePreviewUrl(url = "") {
  if (!url) return "";

  if (url.includes("/preview")) return url;

  const match = url.match(/\/d\/(.+?)\//);

  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }

  return url.startsWith("/api/") ? `${API_URL}${url}` : url;
}
