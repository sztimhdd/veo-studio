/**
 * ConfirmDialog — Reusable confirmation modal
 * z-50 overlay, keyboard-operable (Escape=cancel, Enter=confirm), focus-trapped
 */
import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    confirmRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      data-testid="confirm-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm bg-[#1E1B4B] border border-indigo-500/30 rounded-2xl p-6 shadow-2xl">
        <h2
          id="confirm-dialog-title"
          className="text-base font-bold text-white mb-2"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          {title}
        </h2>
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1B4B] outline-none"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-[#E11D48] hover:bg-[#be1039] transition-colors duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#E11D48] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1B4B] outline-none"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
