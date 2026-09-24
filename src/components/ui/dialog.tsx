"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useRegisterBackModal } from "@/lib/modal-stack";

interface DialogContextType {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextType>({});

const Dialog = ({
  open,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) => {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} {...props}>
        {children}
      </DialogPrimitive.Root>
    </DialogContext.Provider>
  );
};
Dialog.displayName = "Dialog";

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideDragHandle?: boolean;
    hideCloseButton?: boolean;
    disableSwipeToClose?: boolean;
    preventOutsideDismiss?: boolean;
    dismissThreshold?: number;
  }
>(({
  className,
  children,
  hideDragHandle = false,
  hideCloseButton = false,
  disableSwipeToClose = false,
  preventOutsideDismiss = false,
  dismissThreshold = 140,
  style,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}, ref) => {
  const context = React.useContext(DialogContext);
  const internalId = React.useId();
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  // Gesture state for mobile swipe down to dismiss
  const [translateY, setTranslateY] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const touchStartRef = React.useRef<{ y: number; x: number; time: number } | null>(null);
  const isEligibleForDragRef = React.useRef<boolean>(false);

  // Trigger close helper
  const triggerClose = React.useCallback(() => {
    if (context.onOpenChange) {
      context.onOpenChange(false);
      return;
    }
    if (contentRef.current) {
      const closeBtn = contentRef.current.querySelector<HTMLButtonElement>(
        '[data-dialog-close], button[aria-label="Close"], button.absolute',
      );
      if (closeBtn) {
        closeBtn.click();
        return;
      }
    }
    if (typeof document !== "undefined") {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
  }, [context.onOpenChange]);

  // Automatically register this dialog with the mobile back-button stack
  useRegisterBackModal(context.open ?? true, triggerClose, `dialog-${internalId}`);

  // Forward ref callback
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [ref],
  );

  // Touch handlers for swipe-down-to-dismiss gesture
  // STRICT RULE: Drag-to-dismiss is ONLY allowed when starting touch directly on the top drag handle bar!
  // Any touch inside the form or content will NEVER drag or dismiss the modal.
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disableSwipeToClose || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target as HTMLElement;

    // Strict requirement: Only touches starting on the top drag handle can drag down to dismiss
    const isHandle = Boolean(target.closest('[data-drag-handle="true"]'));
    if (!isHandle) {
      isEligibleForDragRef.current = false;
      touchStartRef.current = null;
      return;
    }

    isEligibleForDragRef.current = true;
    touchStartRef.current = {
      y: touch.clientY,
      x: touch.clientX,
      time: Date.now(),
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disableSwipeToClose || !touchStartRef.current || !isEligibleForDragRef.current) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);

    // If moving predominantly horizontal, cancel drag gesture
    if (deltaX > Math.abs(deltaY) && !isDragging) {
      isEligibleForDragRef.current = false;
      return;
    }

    // Only drag downwards from handle with deliberate threshold (requires > 12px)
    if (deltaY > 0) {
      if (!isDragging && deltaY > 12) {
        setIsDragging(true);
      }
      if (isDragging || deltaY > 12) {
        if (e.cancelable) e.preventDefault();
        // Progressive damping for a solid, deliberate tactile feel
        const effectiveY = deltaY - 12;
        const damping = effectiveY > 160 ? 160 + (effectiveY - 160) * 0.4 : effectiveY;
        setTranslateY(damping);
      }
    } else if (isDragging) {
      setTranslateY(0);
      setIsDragging(false);
    }
  };

  const handleTouchEnd = () => {
    if (disableSwipeToClose || !touchStartRef.current) return;

    if (isDragging && translateY > 0) {
      const elapsed = Math.max(1, Date.now() - touchStartRef.current.time);
      const velocity = translateY / elapsed;

      // Close ONLY if dragged down firmly past dismissThreshold (default 140px) or high velocity flick (> 90px & velocity > 0.85)
      const isFirmPull = translateY >= dismissThreshold;
      const isFastFlick = translateY > 90 && velocity > 0.85;

      if (isFirmPull || isFastFlick) {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(15);
        }
        setTranslateY(window.innerHeight || 700);
        setTimeout(() => {
          triggerClose();
          setTranslateY(0);
          setIsDragging(false);
        }, 190);
      } else {
        // Bounce back up smoothly
        setTranslateY(0);
        setIsDragging(false);
      }
    }

    touchStartRef.current = null;
    isEligibleForDragRef.current = false;
  };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRefs}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onPointerDownOutside={(e) => {
          if (preventOutsideDismiss) {
            e.preventDefault();
          }
          onPointerDownOutside?.(e);
        }}
        onInteractOutside={(e) => {
          if (preventOutsideDismiss) {
            e.preventDefault();
          }
          onInteractOutside?.(e);
        }}
        style={{
          ...style,
          transform: translateY > 0 ? `translate3d(0, ${translateY}px, 0)` : undefined,
          transition: isDragging ? "none" : "transform 0.24s cubic-bezier(0.18, 0.89, 0.32, 1.15)",
        }}
        className={cn(
          // Mobile first: Docked bottom sheet, bounded below notch/status-bar with safe-area
          "fixed inset-x-0 bottom-0 z-50 flex flex-col w-full max-w-lg mx-auto max-h-[calc(100dvh-max(1.75rem,calc(env(safe-area-inset-top)+1rem)))] rounded-t-2xl border-t border-x bg-background p-4 sm:p-6 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] shadow-2xl duration-200",
          // Desktop: Centered modal with rounded corners and bounded height
          "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-h-[88vh] sm:rounded-xl sm:border sm:shadow-lg sm:pb-6",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {/* Mobile Pull-Down Drag Handle */}
        {!hideDragHandle && (
          <div
            data-drag-handle="true"
            className="sm:hidden flex flex-col items-center justify-center -mt-2 pb-3 pt-1.5 w-full shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
            aria-label="Drag down firmly to close"
          >
            <div className="h-1.5 w-14 rounded-full bg-muted-foreground/40 hover:bg-muted-foreground/60 transition-colors" />
          </div>
        )}

        {children}

        {/* Floating Close Button - RTL-safe (on left in Arabic, on right in English), thumb-friendly */}
        {!hideCloseButton && (
          <DialogPrimitive.Close
            className="absolute ltr:right-3.5 ltr:sm:right-4 rtl:left-3.5 rtl:sm:left-4 top-3 sm:top-4 rounded-full size-9 sm:size-8 bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground active:scale-90 transition-all flex items-center justify-center z-30 shadow-xs focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:pointer-events-none print:hidden cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5 sm:h-4 sm:w-4 stroke-[2.25]" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-start shrink-0 ltr:pe-9 rtl:ps-9", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end gap-2 shrink-0 pt-3 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)+0.25rem))]",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
