import { useEffect, useRef } from "react";

export type ModalCloseFn = () => void;

export interface RegisteredModal {
  id: string;
  close: ModalCloseFn;
}

// Global in-memory stack of registered modals (LIFO order)
const modalStack: RegisteredModal[] = [];

let isProgrammaticPop = false;

export function isProgrammaticPopActive(): boolean {
  return isProgrammaticPop;
}

/**
 * Register an open modal in the back-navigation stack.
 * Returns an unregister cleanup function.
 */
export function registerModal(id: string, close: ModalCloseFn): () => void {
  // If already present, remove first to push to top of stack
  const existingIdx = modalStack.findIndex((m) => m.id === id);
  if (existingIdx !== -1) {
    modalStack.splice(existingIdx, 1);
  }

  modalStack.push({ id, close });

  // Synchronize with browser history so hardware/browser back or edge-swipe pops this modal
  if (typeof window !== "undefined") {
    try {
      const state = window.history.state || {};
      window.history.pushState(
        { ...state, __vienna_modal__: id, ts: Date.now() },
        "",
        window.location.href,
      );
    } catch {
      // pushState restrictions fallback
    }
  }

  let isUnregistered = false;
  return () => {
    if (isUnregistered) return;
    isUnregistered = true;

    const idx = modalStack.findIndex((m) => m.id === id);
    if (idx !== -1) {
      modalStack.splice(idx, 1);
    }

    // If this modal's history entry is currently the active state, pop it cleanly
    if (typeof window !== "undefined") {
      try {
        const state = window.history.state;
        if (state && state.__vienna_modal__ === id) {
          isProgrammaticPop = true;
          window.history.back();
          setTimeout(() => {
            isProgrammaticPop = false;
          }, 120);
        }
      } catch {
        // ignore
      }
    }
  };
}

/**
 * React hook to register any modal / dialog with the Android Back stack.
 * Automatically adds the modal when open=true and removes when open=false or unmounted.
 */
export function useRegisterBackModal(
  isOpen: boolean,
  onClose: () => void,
  customId?: string,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const idRef = useRef(customId || `modal-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (!isOpen) return;

    const unregister = registerModal(idRef.current, () => {
      closeRef.current();
    });

    return () => {
      unregister();
    };
  }, [isOpen]);
}

/**
 * Check if there is currently any open modal (either in registered stack or in the DOM).
 */
export function hasOpenModal(): boolean {
  if (modalStack.length > 0) return true;

  if (typeof document !== "undefined") {
    const domModals = document.querySelectorAll(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], div[data-radix-portal] [data-state="open"]',
    );
    return domModals.length > 0;
  }

  return false;
}

/**
 * Closes the topmost open modal.
 * Returns true if a modal was found and closed, or false if no modal was open.
 */
export function closeTopModal(): boolean {
  // 1. Try registered modal stack first (cleanest React state transition)
  while (modalStack.length > 0) {
    const top = modalStack.pop();
    if (top) {
      try {
        top.close();
        return true;
      } catch (err) {
        console.warn("Failed to close registered modal:", err);
      }
    }
  }

  // 2. DOM fallback: inspect open Radix dialogs/sheets/overlays in document
  if (typeof document !== "undefined") {
    const domModals = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], div[data-radix-portal] [data-state="open"]',
      ),
    );

    if (domModals.length > 0) {
      const topmost = domModals[domModals.length - 1];

      // Try close button inside modal
      const closeBtn = topmost.querySelector<HTMLButtonElement>(
        'button.absolute, button[aria-label="Close"], button:has(svg.lucide-x), [data-dialog-close]',
      );
      if (closeBtn) {
        closeBtn.click();
        return true;
      }

      // Dispatch Escape keydown
      const escEvent = new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
      });
      topmost.dispatchEvent(escEvent);
      document.dispatchEvent(escEvent);
      return true;
    }
  }

  return false;
}
