import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const VARIANT_CLASSES = {
  primary:
    "bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus-visible:ring-blue-500",

  accent:
    "bg-blue-50 text-blue-700 hover:bg-blue-100 focus-visible:ring-blue-500",

  neutral:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-blue-500",

  warning:
    "text-amber-700 hover:bg-amber-50 focus-visible:ring-amber-500",

  danger:
    "border border-rose-200 bg-rose-50 text-rose-700 shadow-sm hover:border-rose-300 hover:bg-rose-100 focus-visible:ring-rose-500",
};

const HOLD_REST_CLASSES = {
  warning:
    "border-2 border-amber-500 bg-white text-amber-800 shadow-sm hover:bg-amber-50 focus-visible:ring-amber-500",
  danger:
    "border border-rose-300 bg-gradient-to-b from-white to-rose-50 text-rose-800 shadow-sm hover:border-rose-400 focus-visible:ring-rose-500",
};

const HOLD_FILL_CLASSES = {
  warning: "bg-amber-500",
  danger: "bg-red-600",
};

const SIZE_CLASSES = {
  xs: "px-2 py-1 text-[11px]",
  sm: "px-3 py-1.5 text-xs",
  md: "px-3.5 py-2 text-sm",
};

export default function TableActionButton({
  children,

  variant = "neutral",
  size = "md",

  to,
  onClick,

  disabled = false,
  loading = false,

  icon: Icon,

  "aria-label": ariaLabel,
  title,

  className = "",
  type = "button",

  holdToConfirm = false,
  holdDuration = 1200,
  holdLabel = "Segure para confirmar",
  confirmedLabel = "Confirmado",
  loadingLabel,
}) {
  const [holding, setHolding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const timerRef = useRef(null);

  const isHoldAction = holdToConfirm && !to;
  const isBusy = Boolean(loading);
  const isArmed = isHoldAction && (holding || confirmed || isBusy);
  const fillClass = HOLD_FILL_CLASSES[variant] || HOLD_FILL_CLASSES.danger;

  useEffect(() => {
    if (isBusy || !confirmed) return undefined;

    const timeoutId = window.setTimeout(() => {
      setConfirmed(false);
      setHolding(false);
    }, 900);

    return () => window.clearTimeout(timeoutId);
  }, [isBusy, confirmed]);

  const baseClasses = [
    "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
    "select-none",
    SIZE_CLASSES[size] || SIZE_CLASSES.md,
    isHoldAction
      ? HOLD_REST_CLASSES[variant] || HOLD_REST_CLASSES.danger
      : VARIANT_CLASSES[variant] || VARIANT_CLASSES.neutral,
    isHoldAction ? "min-w-[11.5rem] overflow-hidden touch-none" : "",
    isArmed ? "scale-[1.02] shadow-lg ring-2 ring-offset-1" : "",
    isArmed && variant === "danger" ? "ring-red-400 shadow-red-600/25" : "",
    isArmed && variant === "warning" ? "ring-amber-400 shadow-amber-500/25" : "",
    isBusy ? "cursor-wait" : "disabled:cursor-not-allowed disabled:opacity-50",
    className,
  ].join(" ");

  function clearHoldTimer() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function handleHoldStart(event) {
    if (!isHoldAction || disabled || isBusy || confirmed) return;

    event.preventDefault();

    clearHoldTimer();
    setHolding(true);

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setHolding(false);
      setConfirmed(true);
      onClick?.(event);
    }, holdDuration);
  }

  function handleHoldCancel() {
    if (!isHoldAction) return;

    clearHoldTimer();

    if (!confirmed && !isBusy) {
      setHolding(false);
    }
  }

  function handleClick(event) {
    if (isHoldAction) {
      event.preventDefault();
      return;
    }

    onClick?.(event);
  }

  const label = isBusy
    ? loadingLabel || children
    : confirmed
      ? confirmedLabel
      : holding
        ? holdLabel
        : children;

  const content = (
    <>
      {isBusy ? (
        <span
          aria-hidden="true"
          className={`relative z-10 h-4 w-4 animate-spin rounded-full border-2 ${
            isArmed ? "border-white/40 border-t-white" : "border-current border-t-transparent"
          }`}
        />
      ) : (
        Icon && (
          <Icon
            size={14}
            aria-hidden="true"
            className="relative z-10"
          />
        )
      )}

      {label}
    </>
  );

  if (to && !disabled) {
    return (
      <Link
        to={to}
        className={baseClasses}
        aria-label={ariaLabel}
        title={title}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={handleClick}
      onPointerDown={handleHoldStart}
      onPointerUp={handleHoldCancel}
      onPointerLeave={handleHoldCancel}
      onPointerCancel={handleHoldCancel}
      onContextMenu={
        isHoldAction
          ? (event) => event.preventDefault()
          : undefined
      }
      disabled={disabled || isBusy}
      aria-busy={isBusy}
      aria-pressed={isHoldAction ? holding || confirmed : undefined}
      aria-label={ariaLabel}
      title={title || (isHoldAction && !isBusy ? holdLabel : undefined)}
      className={baseClasses}
    >
      {isHoldAction && (
        <>
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 origin-left ${fillClass}`}
            style={{
              transform: isArmed ? "scaleX(1)" : "scaleX(0)",
              transformOrigin: "left center",
              transitionProperty: "transform, opacity",
              transitionTimingFunction: holding ? "linear" : "ease-out",
              transitionDuration: holding ? `${holdDuration}ms` : isBusy ? "0ms" : "160ms",
            }}
          />

          {isBusy && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <span className="animate-danger-loading-sweep absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            </span>
          )}

          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-1 bottom-1 h-1 overflow-hidden rounded-full bg-red-200/80"
          >
            <span
              className={`block h-full origin-left rounded-full ${isBusy ? "bg-white" : "bg-red-700"}`}
              style={{
                transform: isArmed ? "scaleX(1)" : "scaleX(0)",
                transformOrigin: "left center",
                transitionProperty: "transform",
                transitionTimingFunction: holding ? "linear" : "ease-out",
                transitionDuration: holding ? `${holdDuration}ms` : isBusy ? "0ms" : "160ms",
              }}
            />
          </span>
        </>
      )}

      <span
        className={`
          relative z-10 inline-flex items-center justify-center gap-1.5 transition-colors duration-150
          ${isArmed ? "text-white" : ""}
        `}
      >
        {content}
      </span>
    </button>
  );
}
