import { useState } from "react";
import { ImageIcon, ZoomIn, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface ProductImageThumbnailProps {
  url?: string | null | undefined;
  name: string;
  itemCode?: string | null | undefined;
  batchNumber?: string | null | undefined;
  size?: "sm" | "md" | "lg" | undefined;
  className?: string | undefined;
  onClick: () => void;
}

export function ProductImageThumbnail({
  url,
  name,
  itemCode,
  batchNumber,
  size = "md",
  className = "",
  onClick,
}: ProductImageThumbnailProps) {
  const { t } = useI18n();
  const [imageLoaded, setImageLoaded] = useState(false);

  const sizeClasses = {
    sm: "size-10",
    md: "size-12",
    lg: "size-16",
  }[size];

  if (!url) {
    return (
      <div
        className={`flex ${sizeClasses} shrink-0 items-center justify-center rounded-lg border border-border/80 bg-muted/60 text-muted-foreground/60 ${className}`}
        title={t("photoOptional")}
      >
        <ImageIcon className="size-4 opacity-50" />
      </div>
    );
  }

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          aria-label={`${t("viewPhoto")}: ${name}`}
          className={`group relative ${sizeClasses} shrink-0 overflow-hidden rounded-lg border border-border/80 bg-muted shadow-sm transition-all duration-200 hover:border-brand hover:shadow-md hover:ring-2 hover:ring-brand/30 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${className}`}
        >
          {/* Main Thumbnail Image with smooth hover scale */}
          <img
            src={url}
            alt={name}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            className={`size-full object-cover transition-transform duration-300 ease-out group-hover:scale-115 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
          />

          {/* Hover Overlay with Zoom Icon */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover:opacity-100">
            <ZoomIn className="size-4 text-white drop-shadow-md" />
          </div>

          {/* Corner Sparkle indicator on PC */}
          <div className="absolute top-0.5 end-0.5 size-1.5 rounded-full bg-brand ring-1 ring-white/50 opacity-80 group-hover:scale-125 transition-transform" />
        </button>
      </HoverCardTrigger>

      {/* Instant Smooth Hover Zoom Popover on Desktop */}
      <HoverCardContent
        side="right"
        align="center"
        sideOffset={10}
        className="hidden md:block w-72 overflow-hidden rounded-xl border border-brand/25 bg-card/95 p-0 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-200"
      >
        {/* Large Crisp Preview Image */}
        <div
          onClick={onClick}
          className="group/pop relative h-48 w-full cursor-zoom-in overflow-hidden bg-muted/50"
        >
          <img
            src={url}
            alt={name}
            className="size-full object-contain p-1 transition-transform duration-300 ease-out group-hover/pop:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/pop:opacity-100 transition-opacity flex items-end justify-center pb-2">
            <span className="text-[11px] font-medium text-white flex items-center gap-1 drop-shadow">
              <ZoomIn className="size-3" />
              {t("clickToInspect")}
            </span>
          </div>
        </div>

        {/* Caption Info */}
        <div className="border-t bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-1">
            <h4 className="truncate text-xs font-semibold text-cocoa">{name}</h4>
            {batchNumber && (
              <span className="rounded bg-brand/10 px-1.5 py-0.2 text-[10px] font-mono font-medium text-brand">
                #{batchNumber}
              </span>
            )}
          </div>
          {itemCode && (
            <p className="mt-0.5 text-[11px] text-muted-foreground font-mono">{itemCode}</p>
          )}
          <div className="mt-2 flex items-center justify-between border-t pt-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1 text-brand font-medium">
              <Sparkles className="size-2.5" />
              {t("hoverToZoom")}
            </span>
            <span className="underline cursor-pointer hover:text-foreground" onClick={onClick}>
              {t("clickToInspect")}
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
