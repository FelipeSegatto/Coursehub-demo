import { useEffect, useRef, useState } from "react";

const VARIANTS = {
  warning: {
    idle:
      "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
    fill: "bg-amber-500",
    ring: "focus-visible:ring-amber-500",
  },

  danger: {
    idle:
      "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    fill: "bg-red-600",
    ring: "focus-visible:ring-red-500",
  },
};

export default function HoldToConfirmButton({
  children,
  variant = "danger",
  onConfirm,
  holdDuration = 1500,
  disabled = false,
  loading = false,
  icon: Icon,
  className = "",
}) {
  const [holding, setHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const timerRef = useRef(null);

  const styles = VARIANTS[variant] || VARIANTS.danger;

  function clearTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function startHold(event) {
    if (disabled || loading || confirmed) return;

    event.preventDefault();

    clearTimer();
    setHolding(true);

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;

      setHolding(false);
      setConfirmed(true);

      onConfirm?.();

      window.setTimeout(() => {
        setConfirmed(false);
      }, 450);
    }, holdDuration);
  }

  function cancelHold() {
    clearTimer();

    if (!confirmed) {
      setHolding(false);
    }
  }

  useEffect(() => {
    return () => clearTimer();
  }, []);

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onPointerDown={startHold}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onContextMenu={(event) => event.preventDefault()}
      className={`
        relative
        inline-flex
        min-w-[128px]
        select-none
        items-center
        justify-center
        overflow-hidden
        rounded-lg
        px-4
        py-2
        text-xs
        font-semibold
        transition
        touch-none

        focus:outline-none
        focus-visible:ring-2
        focus-visible:ring-offset-1

        disabled:cursor-not-allowed
        disabled:opacity-50

        ${styles.idle}
        ${styles.ring}
        ${className}
      `}
    >
      {/* círculo menor e mais contido */}
      <span
        aria-hidden="true"
        className={`
          pointer-events-none
          absolute
          left-1/2
          top-1/2
          aspect-square
          w-[175%]
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          ${styles.fill}
          ease-linear

          ${
            holding || confirmed
              ? "scale-100 opacity-100"
              : "scale-0 opacity-0"
          }
        `}
        style={{
          transitionProperty: "transform, opacity",
          transitionDuration: holding
            ? `${holdDuration}ms`
            : "160ms",
        }}
      />

      <span
        className={`
          relative
          z-10
          inline-flex
          items-center
          justify-center
          gap-1.5
          transition-colors

          ${
            holding || confirmed
              ? "text-white"
              : ""
          }
        `}
      >
        {loading ? (
          <>
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            />

            <span>Processando...</span>
          </>
        ) : (
          <>
            {Icon && (
              <Icon
                size={14}
                aria-hidden="true"
              />
            )}

            <span>
              {confirmed
                ? "Confirmado"
                : holding
                  ? "Continue segurando..."
                  : children}
            </span>
          </>
        )}
      </span>
    </button>
  );
}