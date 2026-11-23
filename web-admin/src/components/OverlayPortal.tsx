import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface SlideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  children: React.ReactNode;
}

function useOverlayLockAndEsc(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
}

export const SlideDrawer: React.FC<SlideDrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  headerActions,
  footer,
  widthClass = "max-w-2xl",
  children,
}) => {
  useOverlayLockAndEsc(open, onClose);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="anim-backdrop fixed inset-0 bg-[#111424]/45"
        onClick={onClose}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`anim-drawer-right relative z-10 flex h-[100dvh] w-full ${widthClass} flex-col border-l border-[#E5E9F2] bg-white shadow-2xl`}
      >
        {/* Sticky Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#ECEFF6] bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[17px] font-bold leading-snug text-ink-primary">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-[#F3F5FB] hover:text-ink-primary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-[#ECEFF6] bg-white px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  children: React.ReactNode;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  footer,
  widthClass = "max-w-lg",
  children,
}) => {
  useOverlayLockAndEsc(open, onClose);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="anim-backdrop fixed inset-0 bg-[#111424]/45"
        onClick={onClose}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`anim-modal-pop relative z-10 flex max-h-[90dvh] w-full ${widthClass} flex-col overflow-hidden rounded-2xl border border-[#E5E9F2] bg-white shadow-2xl`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#ECEFF6] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[17px] font-bold leading-snug text-ink-primary">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-[#F3F5FB] hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-[#ECEFF6] bg-white px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
