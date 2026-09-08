import { useEffect, useRef, useState } from "react";
import { Camera, Check, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}

export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [hasCamera, setHasCamera] = useState(true);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    startCamera();
    return () => stopCamera();
  }, [open]);

  const startCamera = async () => {
    setScanning(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setHasCamera(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check if native BarcodeDetector API exists
      if ("BarcodeDetector" in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "upc_a"],
          });
          const interval = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0]?.rawValue) {
                const detected = barcodes[0].rawValue.trim();
                clearInterval(interval);
                handleSuccess(detected);
              }
            } catch {
              // Ignore frame detection glitch
            }
          }, 400);

          return () => clearInterval(interval);
        } catch {
          // BarcodeDetector failed, keep camera active for visual framing
        }
      }
    } catch (err) {
      console.warn("Camera access denied or unavailable", err);
      setHasCamera(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const handleSuccess = (code: string) => {
    stopCamera();
    toast.success(`${t("barcodeDetected")}: ${code}`);
    onOpenChange(false);
  };

  const applyManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleSuccess(manualCode.trim());
    setManualCode("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cocoa">
            <QrCode className="size-5 text-brand" />
            {t("scanBarcode")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasCamera ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-black shadow-inner">
              <video
                ref={videoRef}
                playsInline
                muted
                className="size-full object-cover"
              />
              {/* Scanning visual reticle */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative size-44 rounded-lg border-2 border-brand/80 shadow-[0_0_15px_rgba(180,83,9,0.3)]">
                  <div className="absolute inset-x-2 top-1/2 h-0.5 animate-pulse bg-red-500 shadow-[0_0_8px_#ef4444]" />
                </div>
              </div>
              <p className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-white/90 drop-shadow">
                {t("cameraInstruction")}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              <Camera className="mx-auto mb-2 size-8 text-muted-foreground/60" />
              <p>{t("cameraError")}</p>
            </div>
          )}

          <form onSubmit={applyManual} className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground">{t("manualCodeInput")}</p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. RAW-COCOA-001"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
              />
              <Button type="submit" variant="secondary">
                <Check className="size-4" />
                {t("submitCode")}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
