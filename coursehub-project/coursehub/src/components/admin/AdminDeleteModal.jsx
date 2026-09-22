import TableActionButton from "../ui/actions/TableActionButton";

function DeleteConfirmModal({
  title = "Confirmar remoção",
  description = "Tem certeza que deseja remover este item?",
  itemName = "",
  confirmText = "Remover",
  cancelText = "Cancelar",
  loading = false,
  onCancel,
  onConfirm,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>

        <p className="mt-3 text-sm text-gray-600">
          {description}
        </p>

        {itemName && (
          <p className="mt-3 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
            {itemName}
          </p>
        )}

        <p className="mt-4 text-sm text-red-600">
          Essa ação pode alterar o acesso ou status do registro.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
          >
            {cancelText}
          </button>

          <TableActionButton
              variant="danger"
              size="md"
              holdToConfirm
              holdDuration={1500}
              holdLabel="Continue segurando..."
              confirmedLabel={confirmText}
              loadingLabel="Excluindo..."
              onClick={onConfirm}
              disabled={loading}
              loading={loading}
              className="px-5 py-2.5"
            >
              {confirmText}
          </TableActionButton>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmModal;