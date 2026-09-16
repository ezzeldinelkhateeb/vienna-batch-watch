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
    disableSwipeToClose?: boolean;
  }
>(({ className, children, hideDragHandle = false, disableSwipeToClose = false, style, ...props }, ref) => {
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
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (disableSwipeToClose || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const target = e.target as HTMLElement;

    // Direct drag handle touch has highest priority
    const isHandle = Boolean(target.closest('[data-drag-handle="true"]'));

    // Check if target is inside an internally scrollable child
    let scrollParent: HTMLElement | null = target;
    let scrollTop = 0;
    while (scrollParent && scrollParent !== contentRef.current) {
      const computedStyle = window.getComputedStyle(scrollParent);
      if (
        (computedStyle.overflowY === "auto" || computedStyle.overflowY === "scroll") &&
        scrollParent.scrollHeight > scrollParent.clientHeight
      ) {
        scrollTop = scrollParent.scrollTop;
        break;
      }
      scrollParent = scrollParent.parentElement;
    }

    // Eligible if on handle OR scrollable child is already at the very top
    isEligibleForDragRef.current = isHandle || scrollTop <= 0;

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

    // Only drag downwards
    if (deltaY > 0) {
      if (!isDragging && deltaY > 6) {
        setIsDragging(true);
      }
      if (isDragging || deltaY > 6) {
        if (e.cancelable) e.preventDefault();
        const damping = deltaY > 150 ? 150 + (deltaY - 150) * 0.5 : deltaY;
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

      // Close if dragged past 70px or flicked down rapidly
      if (translateY > 70 || (translateY > 30 && velocity > 0.4)) {
        setTranslateY(window.innerHeight || 600);
        setTimeout(() => {
          triggerClose();
          setTranslateY(0);
          setIsDragging(false);
        }, 180);
      } else {
        // Bounce back up
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
        style={{
          ...style,
          transform: translateY > 0 ? `translate3d(0, ${translateY}px, 0)` : undefined,
          transition: isDragging ? "none" : "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
        className={cn(
          // Mobile first: Docked bottom sheet, max-height bound, flex column with overflow containment
          "fixed inset-x-0 bottom-0 z-50 flex flex-col w-full max-w-lg mx-auto max-h-[92dvh] max-h-[92svh] rounded-t-2xl border-t border-x bg-background p-4 sm:p-6 shadow-2xl duration-200",
          // Desktop: Centered modal with rounded corners and bounded height
          "sm:inset-auto sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-h-[88vh] sm:rounded-xl sm:border sm:shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {/* Mobile Pull-Down Drag Handle */}
        {!hideDragHandle && (
          <div
            data-drag-handle="true"
            className="sm:hidden flex flex-col items-center justify-center -mt-2 pb-2 w-full shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
            aria-hidden="true"
          >
            <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors" />
          </div>
        )}

        {children}

        {/* Floating Close Button */}
        <DialogPrimitive.Close className="absolute right-3.5 top-3.5 sm:right-4 sm:top-4 rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted/80 opacity-80 ring-offset-background cursor-pointer transition-all hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none z-30 size-8 flex items-center justify-center print:hidden">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left shrink-0", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 shrink-0 pb-[max(0.5rem,env(safe-area-inset-bottom,12px))]",
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
