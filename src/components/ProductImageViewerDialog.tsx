import { useState, useRef, useEffect } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Maximize2,
  Minimize2,
  X,
  Sparkles,
  Calendar,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QcBadge, type QcStatusType } from "@/components/StatusPill";

export interface ProductImageDetails {
  url: string;
  name: string;
  itemCode?: string | null | undefined;
  batchNumber?: string | null | undefined;
  supplier?: string | null | undefined;
  expiryDate?: string | null | undefined;
  countdown?: string | null | undefined;
  qcStatus?: QcStatusType | null | undefined;
}

interface ProductImageViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ProductImageDetails | null;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.5;
const ZOOM_STEP = 0.35;

export function ProductImageViewerDialog({
  open,
  onOpenChange,
  item,
}: ProductImageViewerDialogProps) {
  const { t } = useI18n();

  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchDistanceRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  // Reset zoom & pan when opening or switching item
  useEffect(() => {
    if (open) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
      setLoaded(false);
    }
  }, [open, item?.url]);

  // Keyboard navigation (+, -, 0)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(MAX_ZOOM, Number((prev + ZOOM_STEP).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => {
      const next = Math.max(MIN_ZOOM, Number((prev - ZOOM_STEP).toFixed(2)));
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  const handleReset = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  // Double click / tap toggle zoom
  const handleDoubleTapOrClick = (clientX?: number, clientY?: number) => {
    if (zoom > 1.2) {
      handleReset();
    } else {
      setZoom(2.2);
      if (clientX !== undefined && clientY !== undefined && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const midY = rect.top + rect.height / 2;
        setPosition({
          x: (midX - clientX) * 0.7,
          y: (midY - clientY) * 0.7,
        });
      }
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0015;
    setZoom((prev) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((prev + delta).toFixed(2))));
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag & pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    const now = Date.now();
    const t0 = e.touches[0];
    const t1 = e.touches[1];

    if (e.touches.length === 1 && t0) {
      // Double tap check
      if (now - lastTapRef.current < 300) {
        handleDoubleTapOrClick(t0.clientX, t0.clientY);
      } else {
        setIsDragging(true);
        setDragStart({
          x: t0.clientX - position.x,
          y: t0.clientY - position.y,
        });
      }
      lastTapRef.current = now;
    } else if (e.touches.length === 2 && t0 && t1) {
      setIsDragging(false);
      const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      touchDistanceRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    const t1 = e.touches[1];

    if (e.touches.length === 1 && isDragging && t0) {
      setPosition({
        x: t0.clientX - dragStart.x,
        y: t0.clientY - dragStart.y,
      });
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null && t0 && t1) {
      const currentDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
      const diff = (currentDist - touchDistanceRef.current) * 0.005;
      setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((prev + diff).toFixed(2)))));
      touchDistanceRef.current = currentDist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistanceRef.current = null;
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Download image
  const handleDownload = async () => {
    if (!item?.url) return;
    try {
      const response = await fetch(item.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const cleanName = (item.name || "vienna-item").replace(/[^\w\d-_]/g, "_");
      const codePart = item.itemCode ? `_${item.itemCode}` : "";
      a.download = `${cleanName}${codePart}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(item.url, "_blank");
    }
  };

  if (!item?.url) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed inset-0 z-50 flex h-[100dvh] w-screen max-w-none flex-col border-none bg-black/92 p-0 text-white backdrop-blur-xl outline-none shadow-2xl overflow-hidden select-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">
          {item.name || "Product Image Viewer"}
        </DialogTitle>

        {/* Top Header Bar */}
        <div className="relative z-30 flex items-center justify-between border-b border-white/10 bg-gradient-to-b from-black/80 to-transparent px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/20 border border-brand/40 text-brand">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm sm:text-base font-semibold text-white">
                  {item.name}
                </h3>
                {item.batchNumber && (
                  <span className="rounded bg-brand/25 px-2 py-0.5 text-[11px] font-mono font-medium text-amber-200 border border-amber-300/30">
                    #{item.batchNumber}
                  </span>
                )}
                {item.qcStatus && <QcBadge status={item.qcStatus} />}
              </div>
              <p className="truncate text-xs text-white/60">
                {item.itemCode ? `${t("itemCode")}: ${item.itemCode}` : ""}
                {item.supplier ? ` • ${item.supplier}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              title={t("downloadPhoto")}
              className="size-9 rounded-full text-white/80 hover:bg-white/15 hover:text-white"
            >
              <Download className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              title={isFullscreen ? t("exitFullscreen") : t("fullscreen")}
              className="hidden sm:inline-flex size-9 rounded-full text-white/80 hover:bg-white/15 hover:text-white"
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              title={t("close")}
              className="size-9 rounded-full text-white/90 bg-white/10 hover:bg-white/20 hover:text-white"
            >
              <X className="size-5" />
            </Button>
          </div>
        </div>

        {/* Main Interactive Zoom Canvas */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={(e) => handleDoubleTapOrClick(e.clientX, e.clientY)}
          className={`relative flex flex-1 items-center justify-center overflow-hidden touch-none ${
            isDragging
              ? "cursor-grabbing"
              : zoom > 1
                ? "cursor-grab"
                : "cursor-zoom-in"
          }`}
        >
          {/* Subtle loading spinner until image renders */}
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50">
              <div className="size-8 rounded-full border-2 border-brand/50 border-t-transparent animate-spin" />
            </div>
          )}

          <div
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${zoom})`,
              transition: isDragging ? "none" : "transform 0.18s cubic-bezier(0.2, 0, 0, 1)",
            }}
            className="relative flex items-center justify-center will-change-transform"
          >
            <img
              src={item.url}
              alt={item.name}
              onLoad={() => setLoaded(true)}
              draggable={false}
              className={`max-h-[75vh] max-w-[92vw] object-contain rounded-lg shadow-2xl transition-opacity duration-300 pointer-events-none select-none ${
                loaded ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </div>

        {/* Bottom Floating Control Dock & Product Details */}
        <div className="relative z-30 flex flex-col items-center gap-2.5 border-t border-white/10 bg-gradient-to-t from-black/90 via-black/75 to-transparent px-4 py-3 sm:px-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {/* Zoom Controller Pill */}
          <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1.5 shadow-xl backdrop-blur-md">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoom <= MIN_ZOOM}
              title={t("zoomOut")}
              className="size-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-40"
            >
              <ZoomOut className="size-4" />
            </Button>

            <button
              type="button"
              onClick={handleReset}
              title={t("resetZoom")}
              className="px-2.5 py-1 text-xs font-mono font-medium text-white/90 hover:text-brand hover:bg-white/10 rounded-md transition-colors"
            >
              {Math.round(zoom * 100)}%
            </button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoom >= MAX_ZOOM}
              title={t("zoomIn")}
              className="size-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-40"
            >
              <ZoomIn className="size-4" />
            </Button>

            <div className="mx-1 h-4 w-px bg-white/20" />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleReset}
              title={t("resetZoom")}
              className="size-8 rounded-full text-white/80 hover:bg-white/15 hover:text-white"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>

          {/* Key Item Meta Badges & User Hint */}
          <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-white/70">
            {item.expiryDate && (
              <div className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 border border-white/10">
                <Calendar className="size-3 text-brand" />
                <span>{item.expiryDate}</span>
                {item.countdown && (
                  <span className="text-white/50 text-[11px]">({item.countdown})</span>
                )}
              </div>
            )}

            <p className="hidden md:inline text-[11px] text-white/50">
              {t("zoomHint")}
            </p>
            <p className="inline md:hidden text-[11px] text-white/50">
              {t("doubleTapHint")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
