import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Check, QrCode, Zap, ZapOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}

// Sound feedback helper using Web Audio API
function playBeepSound() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Ignore audio restrictions
  }
}

export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [hasCamera, setHasCamera] = useState(true);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
  }, []);

  const handleSuccess = useCallback(
    (code: string) => {
      playBeepSound();
      navigator.vibrate?.([40, 50, 60]);
      stopCamera();
      toast.success(`${t("barcodeDetected")}: ${code}`);
      onDetected(code);
      onOpenChange(false);
    },
    [onDetected, onOpenChange, stopCamera, t],
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setHasCamera(false);
        return;
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities = (track.getCapabilities?.() || {}) as { torch?: boolean };
        setTorchSupported(Boolean(capabilities.torch));
      }

      // Check native BarcodeDetector API
      const BarcodeDetectorClass = (
        window as unknown as {
          BarcodeDetector?: new (opts?: { formats: string[] }) => {
            detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeDetectorClass) {
        try {
          const detector = new BarcodeDetectorClass({
            formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "upc_a"],
          });

          intervalRef.current = setInterval(async () => {
            if (!videoRef.current || videoRef.current.readyState < 2) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0 && barcodes[0]?.rawValue) {
                const detected = barcodes[0].rawValue.trim();
                handleSuccess(detected);
              }
            } catch {
              // Frame dropped or not decoded
            }
          }, 350);
        } catch {
          // BarcodeDetector initialization fallback
        }
      }
    } catch (err) {
      console.warn("Camera access denied or unavailable", err);
      setHasCamera(false);
    }
  }, [facingMode, handleSuccess, stopCamera]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }
    void startCamera();
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await (
        track as unknown as {
          applyConstraints: (c: { advanced: Array<{ torch?: boolean }> }) => Promise<void>;
        }
      ).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn("Torch toggle error", err);
    }
  };

  const flipCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const applyManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleSuccess(manualCode.trim());
    setManualCode("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-4 sm:p-6 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-cocoa">
            <QrCode className="size-5 text-brand" />
            {t("scanBarcode")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {hasCamera ? (
            <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-black shadow-inner">
              <video ref={videoRef} playsInline muted className="size-full object-cover" />

              {/* Laser Scanning Animation */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative size-48 rounded-xl border-2 border-brand/90 shadow-[0_0_20px_rgba(180,83,9,0.35)]">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -start-1 size-3 border-t-2 border-s-2 border-amber-300" />
                  <div className="absolute -top-1 -end-1 size-3 border-t-2 border-e-2 border-amber-300" />
                  <div className="absolute -bottom-1 -start-1 size-3 border-b-2 border-s-2 border-amber-300" />
                  <div className="absolute -bottom-1 -end-1 size-3 border-b-2 border-e-2 border-amber-300" />

                  {/* Animated laser line */}
                  <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse" />
                </div>
              </div>

              {/* Floating Camera Controls (Torch & Flip) */}
              <div className="absolute top-3 end-3 flex items-center gap-1.5 z-20">
                {torchSupported && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    title={t("cameraTorch")}
                    className={`flex size-9 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
                      torchOn
                        ? "bg-amber-400 text-black shadow-md"
                        : "bg-black/50 text-white/90 hover:bg-black/70"
                    }`}
                  >
                    {torchOn ? <Zap className="size-4" /> : <ZapOff className="size-4" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={flipCamera}
                  title={t("cameraFlip")}
                  className="flex size-9 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-md hover:bg-black/70 transition-colors"
                >
                  <RefreshCw className="size-4" />
                </button>
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
                className="font-mono text-sm"
              />
              <Button type="submit" variant="secondary" className="gap-1.5 shrink-0">
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
