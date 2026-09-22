import { useEffect } from "react";
import { X } from "lucide-react";
import EditProfileForm from "./EditProfileForm";

function EditProfileModal({
  isOpen,
  profile,
  onClose,
  onSave,
  onProfileChange,
  isSaving,
  message,
  error,
}) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape" && !isSaving) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, isSaving, onClose]);

  if (!isOpen || !profile) {
    return null;
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget && !isSaving) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onMouseDown={handleBackdropClick}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-modal-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 sm:px-8">
          <div>
            <h2
              id="edit-profile-modal-title"
              className="text-xl font-bold text-slate-900"
            >
              Editar informações
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Atualize os dados disponíveis no seu perfil.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Fechar modal"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <EditProfileForm
            profile={profile}
            onSave={onSave}
            onCancel={onClose}
            onProfileChange={onProfileChange}
            isSaving={isSaving}
            message={message}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}

export default EditProfileModal;