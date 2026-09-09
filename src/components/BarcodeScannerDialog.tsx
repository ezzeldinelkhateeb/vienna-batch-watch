import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, Check, QrCode, Zap, ZapOff, RefreshCw, Upload, Sparkles, AlertCircle } from "lucide-react";
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
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // Audio restrictions
  }
}

const READER_ID = "vienna-qr-reader";

export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const { t, lang } = useI18n();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [manualCode, setManualCode] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (err) {
      console.warn("Failed to stop html5-qrcode scanner", err);
    } finally {
      setIsScanning(false);
      setIsStarting(false);
      setTorchOn(false);
    }
  }, []);

  const handleSuccess = useCallback(
    (code: string) => {
      const cleanCode = code.trim();
      if (!cleanCode) return;
      playBeepSound();
      navigator.vibrate?.([40, 50, 60]);
      void stopScanner();
      toast.success(`${t("barcodeDetected")}: ${cleanCode}`);
      onDetected(cleanCode);
      onOpenChange(false);
    },
    [onDetected, onOpenChange, stopScanner, t],
  );

  const startScanner = useCallback(async () => {
    if (typeof window === "undefined") return;
    setCameraError(null);
    setIsStarting(true);
    await stopScanner();

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

      // Verify element exists
      const readerElem = document.getElementById(READER_ID);
      if (!readerElem) {
        setIsStarting(false);
        return;
      }

      const html5QrCode = new Html5Qrcode(READER_ID, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        // Wide rectangle optimized for linear barcodes and square QR codes
        return {
          width: Math.floor(Math.min(320, minEdge * 0.85)),
          height: Math.floor(Math.min(180, minEdge * 0.55)),
        };
      };

      await html5QrCode.start(
        { facingMode },
        {
          fps: 15,
          qrbox: qrboxFunction,
          aspectRatio: 1.333334,
        },
        (decodedText) => {
          handleSuccess(decodedText);
        },
        () => {
          // Frame decode miss - normal while searching
        },
      );

      setIsScanning(true);

      // Check torch capability
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capabilities = (html5QrCode as any).getRunningTrackCapabilities?.();
        if (capabilities && "torch" in capabilities) {
          setTorchSupported(true);
        }
      } catch {
        setTorchSupported(false);
      }
    } catch (err) {
      console.warn("Camera start failed:", err);
      setCameraError(t("cameraStartFailed"));
    } finally {
      setIsStarting(false);
    }
  }, [facingMode, handleSuccess, stopScanner, t]);

  useEffect(() => {
    if (!open) {
      void stopScanner();
      return;
    }
    // Small timeout to allow Dialog DOM to mount reader element
    const timer = setTimeout(() => {
      void startScanner();
    }, 150);

    return () => {
      clearTimeout(timer);
      void stopScanner();
    };
  }, [open, facingMode, startScanner, stopScanner]);

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !torchSupported) return;
    try {
      const nextTorch = !torchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (scannerRef.current as any).applyVideoConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch {
      toast.error(t("errGeneric"));
    }
  };

  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      let tempScanner = scannerRef.current;
      if (!tempScanner) {
        tempScanner = new Html5Qrcode(READER_ID, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });
      }

      toast.info(t("scanningInProgress"));
      const decodedText = await tempScanner.scanFile(file, false);
      if (decodedText) {
        handleSuccess(decodedText);
      }
    } catch (err) {
      console.warn("Scan from file failed:", err);
      toast.error(
        lang === "ar"
          ? "لم يتم العثور على باركود واضح في الصورة. يرجى التقاط صورة أقرب للباركود."
          : "No clear barcode found in the image. Please try a closer photo.",
      );
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleSuccess(manualCode.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <QrCode className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-cocoa">
                  {t("scanBarcode")}
                </DialogTitle>
                <p className="text-[11px] text-muted-foreground">{t("scanCameraGuide")}</p>
              </div>
            </div>

            {/* Camera Controls */}
            <div className="flex items-center gap-1">
              {torchSupported && (
                <Button
                  type="button"
                  variant={torchOn ? "default" : "outline"}
                  size="icon"
                  className="size-8"
                  title={t("cameraTorch")}
                  onClick={toggleTorch}
                >
                  {torchOn ? <Zap className="size-4 text-amber-300" /> : <ZapOff className="size-4" />}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                title={t("cameraFlip")}
                onClick={toggleCameraFacing}
              >
                <RefreshCw className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-8"
                title={t("scanFromImage")}
                onClick={() => imageInputRef.current?.click()}
              >
                <Upload className="size-3.5 text-brand" />
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleScanImageFile}
              />
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Scanner Viewport Box */}
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-brand/40 bg-black shadow-inner">
            {/* HTML5-QRCode Reader Mount Node */}
            <div id={READER_ID} className="size-full overflow-hidden [&_video]:size-full [&_video]:object-cover" />

            {/* Starting / Loading Overlay */}
            {isStarting && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 text-white gap-2">
                <div className="size-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                <p className="text-xs font-medium">{t("scanningInProgress")}</p>
              </div>
            )}

            {/* Camera Error / Fallback State */}
            {cameraError && !isStarting && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 p-4 text-center text-white gap-2">
                <AlertCircle className="size-8 text-amber-400" />
                <p className="text-xs font-semibold text-amber-200">{cameraError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 bg-white/10 text-white border-white/20 hover:bg-white/20 gap-1.5"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  <span>{t("scanFromImage")}</span>
                </Button>
              </div>
            )}

            {/* Laser scanning line animation overlay while scanning */}
            {isScanning && !cameraError && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center p-4">
                <div className="relative h-32 w-64 rounded-lg border-2 border-brand/60 shadow-[0_0_15px_rgba(217,119,6,0.3)]">
                  {/* Corner accents */}
                  <span className="absolute -top-1 -start-1 size-3 border-t-2 border-s-2 border-brand" />
                  <span className="absolute -top-1 -end-1 size-3 border-t-2 border-e-2 border-brand" />
                  <span className="absolute -bottom-1 -start-1 size-3 border-b-2 border-s-2 border-brand" />
                  <span className="absolute -bottom-1 -end-1 size-3 border-b-2 border-e-2 border-brand" />

                  {/* Pulsing Laser line */}
                  <div className="absolute inset-x-1 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-pulse" />
                </div>
              </div>
            )}
          </div>

          {/* Quick Action: Scan from Image */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            >
              <Upload className="size-3.5" />
              <span>{t("scanFromImage")} (من الاستوديو)</span>
            </button>
            <span className="text-[11px] text-muted-foreground">يدعم الباركود 1D و QR Code</span>
          </div>

          {/* Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} className="space-y-1.5 border-t pt-3">
            <div className="flex gap-2">
              <Input
                placeholder={t("manualCodePlaceholder")}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="font-mono text-xs"
              />
              <Button type="submit" size="sm" className="bg-brand text-brand-foreground gap-1 shrink-0">
                <Check className="size-4" />
                <span>{t("apply")}</span>
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
