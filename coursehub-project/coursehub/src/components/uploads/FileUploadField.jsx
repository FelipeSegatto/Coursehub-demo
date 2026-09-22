import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
import {
  formatFileSize,
  formatMaxSizeLabel,
  getUploadRule,
  joinFormats,
  validateSelectedFile,
} from "../../data/fileUploadRules";

function FormatInfoBalloon({ purpose }) {
  const rule = getUploadRule(purpose);
  const buttonRef = useRef(null);
  const balloonRef = useRef(null);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const visible = Boolean(rule && (pinned || hovered));
  const maxLabel = rule ? formatMaxSizeLabel(rule.maxBytes) : "";

  function placeBalloon() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = 260;
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);

    setCoords({
      top: rect.bottom + 8,
      left,
    });
  }

  useEffect(() => {
    if (!visible) return undefined;

    placeBalloon();

    function handlePointerDown(event) {
      if (
        buttonRef.current?.contains(event.target) ||
        balloonRef.current?.contains(event.target)
      ) {
        return;
      }

      setPinned(false);
      setHovered(false);
    }

    function handleViewportChange() {
      setPinned(false);
      setHovered(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [visible]);

  if (!rule) return null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
        aria-label="Ver formatos e tamanho aceitos"
        aria-expanded={visible}
        onMouseEnter={() => {
          placeBalloon();
          setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          placeBalloon();
          setPinned((current) => !current);
        }}
      >
        <CircleHelp className="h-4 w-4" />
      </button>

      {visible &&
        createPortal(
          <div
            ref={balloonRef}
            role="tooltip"
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-[80] w-[260px] rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <p className="text-sm font-semibold text-slate-900">Arquivos aceitos</p>
            <p className="mt-1 text-sm text-slate-600">{joinFormats(rule.extensions)}</p>
            <p className="mt-2 text-sm text-slate-600">
              Tamanho máximo: <span className="font-semibold text-slate-800">{maxLabel}</span>
            </p>
          </div>,
          document.body
        )}
    </>
  );
}

function FileUploadField({
  purpose,
  file,
  onFileChange,
  label = "Arquivo",
  disabled = false,
  inputClass = "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100",
}) {
  const inputId = useId();
  const rule = getUploadRule(purpose);
  const [validationError, setValidationError] = useState("");

  if (!rule) return null;

  function handleChange(event) {
    const nextFile = event.target.files?.[0] || null;

    if (!nextFile) {
      setValidationError("");
      onFileChange(null);
      return;
    }

    const error = validateSelectedFile(nextFile, purpose);

    if (error) {
      event.target.value = "";
      setValidationError(error);
      onFileChange(null);
      return;
    }

    setValidationError("");
    onFileChange(nextFile);
  }

  function handleClear() {
    setValidationError("");
    onFileChange(null);
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
        <FormatInfoBalloon purpose={purpose} />
      </div>

      <input
        id={inputId}
        type="file"
        accept={rule.accept}
        disabled={disabled}
        onChange={handleChange}
        className={inputClass}
      />

      {file && (
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
          <span className="truncate">
            {file.name} · {formatFileSize(file.size)}
          </span>
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <X className="h-3.5 w-3.5" />
            Remover
          </button>
        </div>
      )}

      {validationError && <p className="mt-2 text-sm text-red-600">{validationError}</p>}
    </div>
  );
}

export { FormatInfoBalloon };
export default FileUploadField;
