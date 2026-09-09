import { useState, useRef, useEffect, useMemo } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  ChevronLeft,
  ChevronRight,
  ImageIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { QcBadge, type QcStatusType } from "@/components/StatusPill";

export interface ViewerPhotoItem {
  url: string;
  caption?: string | undefined;
}

export interface ProductImageDetails {
  url?: string | undefined;
  photos?: ViewerPhotoItem[] | undefined;
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
  initialIndex?: number | undefined;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4.5;
const ZOOM_STEP = 0.35;

export function ProductImageViewerDialog({
  open,
  onOpenChange,
  item,
  initialIndex = 0,
}: ProductImageViewerDialogProps) {
  const { t, lang } = useI18n();

  // Normalize photos list
  const photoList = useMemo<ViewerPhotoItem[]>(() => {
    if (!item) return [];
    if (item.photos && item.photos.length > 0) {
      return item.photos.filter((p) => Boolean(p.url));
    }
    if (item.url) {
      return [{ url: item.url, caption: "" }];
    }
    return [];
  }, [item]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchDistanceRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const lastTapRef = useRef<number>(0);

  // Sync active index on open
  useEffect(() => {
    if (open) {
      setActiveIndex(Math.min(initialIndex, Math.max(0, photoList.length - 1)));
      setZoom(1);
      setPosition({ x: 0, y: 0 });
      setIsDragging(false);
      setLoaded(false);
    }
  }, [open, initialIndex, photoList.length]);

  // Reset zoom & pan when switching photo
  const currentPhoto = photoList[activeIndex];

  const handleSelectPhoto = (index: number) => {
    if (index < 0 || index >= photoList.length) return;
    setActiveIndex(index);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setLoaded(false);
  };

  const handleNextPhoto = () => {
    if (activeIndex < photoList.length - 1) {
      handleSelectPhoto(activeIndex + 1);
    } else {
      handleSelectPhoto(0); // loop
    }
  };

  const handlePrevPhoto = () => {
    if (activeIndex > 0) {
      handleSelectPhoto(activeIndex - 1);
    } else {
      handleSelectPhoto(photoList.length - 1); // loop
    }
  };

  // Keyboard navigation (+, -, 0, ArrowLeft, ArrowRight)
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
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (lang === "ar") handlePrevPhoto();
        else handleNextPhoto();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (lang === "ar") handleNextPhoto();
        else handlePrevPhoto();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, activeIndex, photoList.length, lang]);

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

  // Touch drag & pinch-to-zoom & swipe between photos
  const handleTouchStart = (e: React.TouchEvent) => {
    const now = Date.now();
    const t0 = e.touches[0];
    const t1 = e.touches[1];

    if (e.touches.length === 1 && t0) {
      touchStartXRef.current = t0.clientX;
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

  const handleTouchEnd = (e: React.TouchEvent) => {
    // If not zoomed in, detect horizontal swipe between photos
    if (zoom <= 1.05 && touchStartXRef.current !== null && e.changedTouches[0]) {
      const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
      if (Math.abs(diffX) > 60) {
        if (diffX > 0) {
          // Swiped right
          if (lang === "ar") handleNextPhoto();
          else handlePrevPhoto();
        } else {
          // Swiped left
          if (lang === "ar") handlePrevPhoto();
          else handleNextPhoto();
        }
      }
    }
    setIsDragging(false);
    touchDistanceRef.current = null;
    touchStartXRef.current = null;
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
    if (!currentPhoto?.url) return;
    try {
      const response = await fetch(currentPhoto.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const cleanName = (item?.name || "vienna-item").replace(/[^\w\d-_]/g, "_");
      const codePart = item?.itemCode ? `_${item.itemCode}` : "";
      const indexPart = photoList.length > 1 ? `_photo${activeIndex + 1}` : "";
      a.download = `${cleanName}${codePart}${indexPart}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(currentPhoto.url, "_blank");
    }
  };

  if (!item || photoList.length === 0 || !currentPhoto) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Fullscreen clean backdrop */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Clean full-viewport container without conflicting left-50%/translate-x-50% */}
        <DialogPrimitive.Content
          className="fixed inset-0 left-0 top-0 z-50 flex h-dvh w-screen flex-col border-none bg-black/95 text-white p-0 m-0 outline-none overflow-hidden select-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            {item.name || "Product Image Viewer"}
          </DialogPrimitive.Title>

          {/* Top Header Bar */}
          <div className="relative z-30 flex items-center justify-between border-b border-white/10 bg-gradient-to-b from-black/90 to-black/70 px-4 py-3 sm:px-6">
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
                  {photoList.length > 1 && (
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white border border-white/20">
                      {activeIndex + 1} / {photoList.length}
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

          {/* Main Interactive Zoom Canvas (Strict LTR for coordinate stability) */}
          <div
            dir="ltr"
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
              isDragging ? "cursor-grabbing" : zoom > 1 ? "cursor-grab" : "cursor-zoom-in"
            }`}
          >
            {/* Loading spinner */}
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/50">
                <div className="size-8 rounded-full border-2 border-brand/50 border-t-transparent animate-spin" />
              </div>
            )}

            {/* Left navigation arrow for multi-photos */}
            {photoList.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrevPhoto();
                }}
                aria-label="Previous Photo"
                className="absolute left-3 z-30 flex size-10 items-center justify-center rounded-full bg-black/60 text-white/90 border border-white/20 shadow-lg backdrop-blur-md transition-transform hover:scale-110 hover:bg-black/80 active:scale-95"
              >
                <ChevronLeft className="size-6" />
              </button>
            )}

            {/* Right navigation arrow for multi-photos */}
            {photoList.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNextPhoto();
                }}
                aria-label="Next Photo"
                className="absolute right-3 z-30 flex size-10 items-center justify-center rounded-full bg-black/60 text-white/90 border border-white/20 shadow-lg backdrop-blur-md transition-transform hover:scale-110 hover:bg-black/80 active:scale-95"
              >
                <ChevronRight className="size-6" />
              </button>
            )}

            {/* Centered Zoom/Pan Container */}
            <div
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${zoom})`,
                transition: isDragging ? "none" : "transform 0.18s cubic-bezier(0.2, 0, 0, 1)",
              }}
              className="relative flex items-center justify-center will-change-transform max-h-full max-w-full"
            >
              <img
                key={currentPhoto.url}
                src={currentPhoto.url}
                alt={currentPhoto.caption || item.name}
                onLoad={() => setLoaded(true)}
                draggable={false}
                className={`max-h-[70vh] max-w-[92vw] object-contain rounded-lg shadow-2xl transition-opacity duration-300 pointer-events-none select-none ${
                  loaded ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
          </div>

          {/* Bottom Floating Control Dock & Product Details */}
          <div className="relative z-30 flex flex-col items-center gap-2 border-t border-white/10 bg-gradient-to-t from-black/95 via-black/85 to-black/60 px-4 py-2.5 sm:px-6 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            {/* Active Photo Caption Banner if available */}
            {currentPhoto.caption && (
              <div className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/20 px-3.5 py-1 text-xs font-semibold text-amber-200 shadow-md backdrop-blur-md max-w-[90vw] truncate">
                <span>🏷️</span>
                <span className="truncate">{currentPhoto.caption}</span>
              </div>
            )}

            {/* Multi-Photo Thumbnails Strip */}
            {photoList.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-[92vw] scrollbar-none">
                {photoList.map((photo, idx) => (
                  <button
                    key={`${photo.url}-${idx}`}
                    type="button"
                    onClick={() => handleSelectPhoto(idx)}
                    className={`relative size-12 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                      idx === activeIndex
                        ? "border-brand ring-2 ring-brand/50 scale-105 opacity-100"
                        : "border-white/20 opacity-60 hover:opacity-90"
                    }`}
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || `Photo ${idx + 1}`}
                      className="size-full object-cover"
                    />
                    {idx === activeIndex && (
                      <div className="absolute inset-0 bg-brand/15" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Zoom Controller Pill */}
            <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-3 py-1 shadow-xl backdrop-blur-md">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleZoomOut}
                disabled={zoom <= MIN_ZOOM}
                title={t("zoomOut")}
                className="size-7 rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-40"
              >
                <ZoomOut className="size-3.5" />
              </Button>

              <button
                type="button"
                onClick={handleReset}
                title={t("resetZoom")}
                className="px-2 font-mono text-xs font-semibold text-white/90 hover:text-brand transition-colors"
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
                className="size-7 rounded-full text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-40"
              >
                <ZoomIn className="size-3.5" />
              </Button>

              <div className="mx-1 h-3.5 w-px bg-white/20" />

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleReset}
                title={t("resetZoom")}
                className="size-7 rounded-full text-white/80 hover:bg-white/15 hover:text-white"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>

            {/* Metadata Footer bar */}
            {(item.expiryDate || item.countdown) && (
              <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-white/70">
                {item.expiryDate && (
                  <span className="flex items-center gap-1 font-mono">
                    <Calendar className="size-3 text-brand" />
                    {item.expiryDate}
                  </span>
                )}
                {item.countdown && (
                  <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium text-white/90">
                    {item.countdown}
                  </span>
                )}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
