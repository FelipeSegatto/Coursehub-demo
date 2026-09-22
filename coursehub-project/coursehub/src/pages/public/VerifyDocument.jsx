import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { verifyDocument } from "../../services/AcademicDocumentsService";

const TYPE_LABEL = {
  certificate: "Certificado",
  enrollment_declaration: "Declaração de matrícula",
  attendance_declaration: "Declaração de frequência",
  completion_declaration: "Declaração de conclusão",
};

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}

export default function VerifyDocument() {
  const { code: codeFromUrl } = useParams();
  const [code, setCode] = useState(codeFromUrl || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runVerification(targetCode) {
    if (!targetCode) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const { data } = await verifyDocument(targetCode);
      setResult(data);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível verificar o documento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (codeFromUrl) runVerification(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  return (
    <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-bold text-gray-900">Verificar documento</h1>
      <p className="mt-2 text-gray-600">
        Digite o código impresso no certificado ou declaração para confirmar sua autenticidade.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          runVerification(code.trim().toUpperCase());
        }}
        className="mt-6 flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Ex: 43969PWVRHQL"
          className="flex-1 rounded-xl border border-gray-300 px-4 py-3 uppercase outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          Verificar
        </button>
      </form>

      {error && <p className="mt-6 text-red-600">{error}</p>}

      {result && (
        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
          {result.status === "not_found" && (
            <p className="text-lg font-semibold text-gray-500">Código não encontrado.</p>
          )}

          {result.status === "revoked" && (
            <p className="text-lg font-semibold text-red-600">Este documento foi revogado.</p>
          )}

          {result.status === "valid" && (
            <>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">Documento válido</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">{result.studentName}</h2>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <dt className="text-gray-500">Tipo</dt>
                  <dd className="font-medium text-gray-900">{TYPE_LABEL[result.documentType] || result.documentType}</dd>
                </div>
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <dt className="text-gray-500">Curso</dt>
                  <dd className="font-medium text-gray-900">{result.courseName}</dd>
                </div>
                {result.workloadHours && (
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <dt className="text-gray-500">Carga horária</dt>
                    <dd className="font-medium text-gray-900">{result.workloadHours}h</dd>
                  </div>
                )}
                <div className="flex justify-between border-b border-gray-100 pb-2">
                  <dt className="text-gray-500">Emitido em</dt>
                  <dd className="font-medium text-gray-900">{formatDate(result.issuedAt)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Código</dt>
                  <dd className="font-mono font-medium text-gray-900">{result.verificationCode}</dd>
                </div>
              </dl>
            </>
          )}
        </div>
      )}
    </main>
  );
}
