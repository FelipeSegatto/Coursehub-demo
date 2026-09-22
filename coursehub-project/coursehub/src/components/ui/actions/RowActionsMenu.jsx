import { useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { MoreHorizontal } from "lucide-react";

const ITEM_VARIANT_CLASSES = {
  neutral: "text-gray-700 data-[highlighted]:bg-gray-50",
  warning: "text-amber-700 data-[highlighted]:bg-amber-50",
  danger: "text-red-600 data-[highlighted]:bg-red-50",
};

/**
 * Item destrutivo com hold-to-confirm.
 *
 * O DropdownMenu NÃO fecha enquanto o usuário estiver segurando.
 * A ação só é disparada quando o tempo de confirmação é concluído.
 */
function DestructiveMenuItem({
  item,
  onConfirmed,
  holdDuration = 1200,
}) {
  const [holding, setHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const timerRef = useRef(null);
  const duration = item.holdDuration || holdDuration;
  const isBusy = Boolean(item.loading);
  const isArmed = holding || confirmed || isBusy;

  function clearTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function startHolding(event) {
    if (item.disabled || isBusy || confirmed) return;

    event.preventDefault();
    clearTimer();
    setHolding(true);

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      setConfirmed(true);
      item.onClick?.();

      window.setTimeout(() => {
        onConfirmed?.();
      }, 250);
    }, duration);
  }

  function cancelHolding() {
    clearTimer();

    if (!confirmed && !isBusy) {
      setHolding(false);
    }
  }

  const label = isBusy
    ? item.loadingLabel || "Excluindo..."
    : confirmed
      ? item.confirmedLabel || "Confirmado"
      : holding
        ? item.holdLabel || "Continue segurando..."
        : item.label;

  return (
    <DropdownMenu.Item
      disabled={item.disabled || isBusy}
      title={item.title}
      onSelect={(event) => {
        event.preventDefault();
      }}
      className={`
        relative flex cursor-pointer select-none items-center overflow-hidden rounded-lg
        px-3 py-2.5 text-sm font-semibold outline-none transition
        data-[disabled]:cursor-not-allowed
        ${isBusy ? "cursor-wait" : "data-[disabled]:opacity-50"}
        ${
          isArmed
            ? "text-white ring-1 ring-red-400"
            : "border border-transparent text-red-700 data-[highlighted]:border-red-200 data-[highlighted]:bg-red-50"
        }
      `}
      onPointerDown={startHolding}
      onPointerUp={cancelHolding}
      onPointerLeave={cancelHolding}
      onPointerCancel={cancelHolding}
      onContextMenu={(event) => event.preventDefault()}
      aria-busy={isBusy}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-left bg-red-600"
        style={{
          transform: isArmed ? "scaleX(1)" : "scaleX(0)",
          transitionProperty: "transform",
          transitionTimingFunction: holding ? "linear" : "ease-out",
          transitionDuration: holding ? `${duration}ms` : isBusy ? "0ms" : "160ms",
        }}
      />

      {isBusy && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="animate-danger-loading-sweep absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        </span>
      )}

      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full bg-red-200/90"
      >
        <span
          className={`block h-full origin-left rounded-full ${isBusy ? "bg-white" : "bg-red-800"}`}
          style={{
            transform: isArmed ? "scaleX(1)" : "scaleX(0)",
            transitionProperty: "transform",
            transitionTimingFunction: holding ? "linear" : "ease-out",
            transitionDuration: holding ? `${duration}ms` : isBusy ? "0ms" : "160ms",
          }}
        />
      </span>

      <span className="relative z-10 flex items-center gap-2">
        {isBusy ? (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        ) : (
          item.icon && <item.icon size={15} aria-hidden="true" />
        )}

        <span>{label}</span>
      </span>
    </DropdownMenu.Item>
  );
}

export default function RowActionsMenu({
  items,
  label = "Mais ações",
}) {
  const [open, setOpen] = useState(false);

  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) return null;

  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={setOpen}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className="
            inline-flex
            h-8
            w-8
            items-center
            justify-center
            rounded-lg
            border
            border-gray-300
            bg-white
            text-gray-500
            transition
            hover:bg-gray-50
            focus:outline-none
            focus-visible:ring-2
            focus-visible:ring-blue-500
            focus-visible:ring-offset-1
          "
        >
          <MoreHorizontal
            size={16}
            aria-hidden="true"
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="
            z-50
            min-w-[190px]
            rounded-xl
            border
            border-gray-200
            bg-white
            p-1.5
            shadow-lg
            focus:outline-none
          "
        >
          {visibleItems.map((item) => {
            const isHoldAction = item.holdToConfirm === true;

            return (
              <div key={item.key}>
                {item.separator && (
                  <DropdownMenu.Separator
                    className="my-1.5 h-px bg-gray-100"
                  />
                )}

                {isHoldAction ? (
                  <DestructiveMenuItem
                    item={item}
                    onConfirmed={() => setOpen(false)}
                  />
                ) : (
                  <DropdownMenu.Item
                    disabled={item.disabled}
                    onSelect={item.onClick}
                    title={item.title}
                    className={`
                      flex
                      cursor-pointer
                      items-center
                      gap-2
                      rounded-lg
                      px-3
                      py-2
                      text-sm
                      font-medium
                      outline-none
                      transition

                      data-[disabled]:cursor-not-allowed
                      data-[disabled]:opacity-50

                      ${
                        ITEM_VARIANT_CLASSES[item.variant] ||
                        ITEM_VARIANT_CLASSES.neutral
                      }
                    `}
                  >
                    {item.icon && (
                      <item.icon
                        size={15}
                        aria-hidden="true"
                      />
                    )}

                    {item.label}
                  </DropdownMenu.Item>
                )}
              </div>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
