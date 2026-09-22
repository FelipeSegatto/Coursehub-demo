import { useEffect, useState } from "react";

import DocumentDownloadButton from "../../components/documents/DocumentDownloadButton";
import {
  getMyAcademicDocuments,
  getStudentEnrollmentDeclarationEndpoints,
  getStudentCompletionDeclarationEndpoints,
  getStudentCertificateEndpoints,
  getStudentAttendanceDeclarationEndpoints,
} from "../../services/AcademicDocumentsService";

const TYPE_LABEL = {
  enrollment: "Declaração de matrícula",
  attendance: "Declaração de frequência",
  completion: "Declaração de conclusão",
  certificate: "Certificado",
};

function endpointsForDocument(document) {
  if (document.type === "certificate") return getStudentCertificateEndpoints(document.enrollmentId);
  if (document.type === "completion") return getStudentCompletionDeclarationEndpoints(document.enrollmentId);
  if (document.type === "attendance") {
    return getStudentAttendanceDeclarationEndpoints(document.enrollmentId, {
      referencePeriodStart: document.referencePeriodStart,
      referencePeriodEnd: document.referencePeriodEnd,
    });
  }

  return getStudentEnrollmentDeclarationEndpoints(document.enrollmentId);
}

function canOfferDownload(document) {
  if (document.type !== "attendance") return true;

  return Boolean(document.referencePeriodStart && document.referencePeriodEnd);
}

export default function StudentDocuments() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const { data } = await getMyAcademicDocuments();
        if (mounted) setDocuments(data || []);
      } catch (requestError) {
        if (mounted) setError(requestError.message || "Não foi possível carregar seus documentos.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <p className="text-gray-500">Carregando seus documentos...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-gray-900">Meus Documentos</h1>
      <p className="mt-2 text-gray-600">Declarações e certificados emitidos para as suas matrículas.</p>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {!error && documents.length === 0 && (
        <p className="mt-8 text-gray-500">Nenhum documento emitido até o momento.</p>
      )}

      <div className="mt-8 space-y-3">
        {documents.map((document) => (
          <div
            key={`${document.kind}-${document.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-5"
          >
            <div>
              <p className="font-semibold text-gray-900">{TYPE_LABEL[document.type] || document.type}</p>
              <p className="text-sm text-gray-500">{document.courseName}</p>
              <p className="mt-1 text-xs text-gray-400">
                Código: {document.verificationCode}
                {document.status === "revoked" && <span className="ml-2 text-red-600">· Revogado</span>}
              </p>
            </div>

            {document.status === "active" && canOfferDownload(document) ? (
              <DocumentDownloadButton endpoints={endpointsForDocument(document)} label="documento" />
            ) : document.status === "active" ? (
              <span className="text-sm text-gray-400">Período da declaração não encontrado</span>
            ) : (
              <span className="text-sm text-gray-400">Indisponível</span>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
