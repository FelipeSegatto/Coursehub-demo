import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 20;

/**
 * Botão único para os 6 pontos de integração (contrato/2ª via/recibo x
 * admin/aluno) -- a máquina de estados (solicitar -> aguardar pronto
 * -> baixar) é idêntica nos 6 casos, só os endpoints mudam.
 *
 * endpoints: { request, status, downloadUrl } (ver DocumentGenerationService.jsx)
 */
function unwrapDocument(payload) {
  return payload?.data ?? payload ?? {};
}

function documentPipelineStatus(dto) {
  return dto.documentStatus || dto.status || "";
}

export default function DocumentDownloadButton({ endpoints, label, className = "" }) {
  const [state, setState] = useState("idle"); // idle | requesting | polling | ready | failed | timeout
  const [errorMessage, setErrorMessage] = useState("");
  const pollAttemptsRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromStatus() {
      try {
        const dto = unwrapDocument(await endpoints.status());
        if (cancelled) return;

        if (dto.canDownload) {
          setState("ready");
        }
      } catch {
        // Documento ainda não solicitado — o botão permanece em idle.
      }
    }

    hydrateFromStatus();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [endpoints.downloadUrl]);

  function scheduleNextPoll() {
    timerRef.current = setTimeout(pollStatus, POLL_INTERVAL_MS);
  }

  async function pollStatus() {
    pollAttemptsRef.current += 1;

    try {
      const dto = unwrapDocument(await endpoints.status());

      if (dto.canDownload) {
        setState("ready");
        return;
      }

      if (documentPipelineStatus(dto) === "failed") {
        setState("failed");
        return;
      }

      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setState("timeout");
        return;
      }

      scheduleNextPoll();
    } catch {
      setState("failed");
      setErrorMessage("Não foi possível consultar o status do documento.");
    }
  }

  async function handleClick() {
    setErrorMessage("");
    setState("requesting");
    pollAttemptsRef.current = 0;

    try {
      let dto;

      try {
        dto = unwrapDocument(await endpoints.request());
      } catch (requestError) {
        if (requestError.status !== 404 && requestError.status !== 405) {
          throw requestError;
        }

        dto = unwrapDocument(await endpoints.status());
      }

      if (dto.canDownload) {
        setState("ready");
        return;
      }

      if (documentPipelineStatus(dto) === "failed") {
        setState("failed");
        return;
      }

      setState("polling");
      scheduleNextPoll();
    } catch (error) {
      setState("failed");
      setErrorMessage(error.message || "Não foi possível solicitar o documento.");
    }
  }

  if (state === "ready") {
    return (
      <a
        href={endpoints.downloadUrl}
        className={
          className ||
          "inline-flex items-center rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200"
        }
      >
        Baixar {label}
      </a>
    );
  }

  if (state === "requesting" || state === "polling") {
    return (
      <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-500">
        Preparando documento...
      </span>
    );
  }

  if (state === "failed" || state === "timeout") {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="text-sm text-red-600">
          {state === "timeout" ? "A geração está demorando mais que o esperado." : "Falha ao gerar documento."}
          {errorMessage ? ` ${errorMessage}` : ""}
        </span>
        <button
          type="button"
          onClick={handleClick}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Verificar novamente
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ||
        "inline-flex items-center rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200"
      }
    >
      Baixar {label}
    </button>
  );
}
