import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  RefreshCw,
  Zap,
  ZapOff,
  X,
  Sparkles,
  AlertCircle,
  Check,
  Smartphone,
  RotateCw,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useRegisterBackModal } from "@/lib/modal-stack";
import { rotateImageBlob } from "@/lib/photos";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CameraCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPhotoCaptured: (file: File) => void;
}

interface PendingPhoto {
  file: File;
  previewUrl: string;
  rotation: number;
}

export function CameraCaptureModal({
  open,
  onOpenChange,
  onPhotoCaptured,
}: CameraCaptureModalProps) {
  useRegisterBackModal(open, () => onOpenChange(false), "camera-modal");
  const { lang } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const systemCameraRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);

  // Photo Review & Approval state
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  // Stop camera tracks safely
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  // Start live stream
  const startCamera = useCallback(async (desiredFacing = facingMode) => {
    stopStream();
    setCameraLoading(true);
    setCameraError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        lang === "ar"
          ? "المتصفح لا يدعم الوصول المباشر للكاميرا. يمكنك استخدام كاميرا النظام بالأسفل."
          : "Direct camera stream not supported. Please use the system camera below.",
      );
      setCameraLoading(false);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: desiredFacing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Check flashlight/torch support
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capabilities: any = typeof videoTrack.getCapabilities === "function" ? videoTrack.getCapabilities() : {};
        if (capabilities && "torch" in capabilities) {
          setTorchAvailable(true);
        }
      }
      setCameraLoading(false);
    } catch (err) {
      console.warn("Camera start error:", err);
      const isPermissionDenied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");

      if (isPermissionDenied) {
        setCameraError(
          lang === "ar"
            ? "تم رفض إذن الكاميرا. يُرجى السماح للتطبيق باستخدام الكاميرا من إعدادات المتصفح، أو الضغط على زر كاميرا النظام بالأسفل."
            : "Camera permission denied. Please enable camera access in your browser settings or use the system camera below.",
        );
      } else {
        setCameraError(
          lang === "ar"
            ? "تعذر تشغيل الكاميرا المباشرة. يمكنك استخدام كاميرا النظام لالتقاط الصورة."
            : "Could not start camera. You can capture using the system camera.",
        );
      }
      setCameraLoading(false);
    }
  }, [facingMode, lang, stopStream]);

  // Manage camera lifecycle with modal open/close
  useEffect(() => {
    if (open) {
      setCapturedCount(0);
      setPendingPhoto((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      void startCamera(facingMode);
    } else {
      setPendingPhoto((prev) => {
        if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
        return null;
      });
      stopStream();
    }
    return () => {
      stopStream();
    };
  }, [open, startCamera, facingMode, stopStream]);

  // Flip camera
  const toggleFacingMode = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    void startCamera(nextMode);
  };

  // Toggle flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const nextTorch = !torchOn;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (videoTrack as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn("Torch failed:", err);
      toast.error(lang === "ar" ? "تعذر تشغيل الفلاش" : "Flashlight not supported");
    }
  };

  // Capture current frame to Blob/File and show in Preview Mode (do not auto-save)
  const handleCapture = () => {
    if (!videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    if (width === 0 || height === 0) {
      toast.error(lang === "ar" ? "الكاميرا غير جاهزة بعد" : "Camera not ready yet");
      return;
    }

    // Flash animation & haptic feedback
    setFlashAnimation(true);
    setTimeout(() => setFlashAnimation(false), 200);
    navigator.vibrate?.([30, 40]);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // Draw frame
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error(lang === "ar" ? "فشل التقاط الصورة" : "Failed to capture photo");
          return;
        }

        const file = new File(
          [blob],
          `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`,
          { type: "image/jpeg" },
        );

        // Revoke existing URL if any
        if (pendingPhoto?.previewUrl) {
          URL.revokeObjectURL(pendingPhoto.previewUrl);
        }

        const previewUrl = URL.createObjectURL(file);
        setPendingPhoto({
          file,
          previewUrl,
          rotation: 0,
        });
      },
      "image/jpeg",
      0.92,
    );
  };

  // Fallback native system camera file input -> also goes to preview mode
  const handleSystemCameraFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    if (pendingPhoto?.previewUrl) {
      URL.revokeObjectURL(pendingPhoto.previewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setPendingPhoto({
      file,
      previewUrl,
      rotation: 0,
    });

    e.target.value = "";
  };

  // Rotate preview 90 degrees clockwise
  const handleRotatePreview = () => {
    setPendingPhoto((prev) => (prev ? { ...prev, rotation: (prev.rotation + 90) % 360 } : null));
  };

  // Discard preview and retake
  const handleRetake = () => {
    if (pendingPhoto?.previewUrl) {
      URL.revokeObjectURL(pendingPhoto.previewUrl);
    }
    setPendingPhoto(null);
  };

  // Approve & finalize photo
  const handleApprovePhoto = async (keepOpen = false) => {
    if (!pendingPhoto || isProcessingApproval) return;

    setIsProcessingApproval(true);
    try {
      let finalFile = pendingPhoto.file;

      // Apply rotation if needed
      if (pendingPhoto.rotation !== 0) {
        const rotatedBlob = await rotateImageBlob(pendingPhoto.file, pendingPhoto.rotation);
        finalFile = new File([rotatedBlob], pendingPhoto.file.name, {
          type: "image/jpeg",
        });
      }

      onPhotoCaptured(finalFile);
      setCapturedCount((c) => c + 1);
      toast.success(
        lang === "ar" ? "تم اعتماد وحفظ الصورة بنجاح ✅" : "Photo approved and saved ✅",
      );

      if (pendingPhoto.previewUrl) {
        URL.revokeObjectURL(pendingPhoto.previewUrl);
      }
      setPendingPhoto(null);

      if (!keepOpen) {
        onOpenChange(false);
      }
    } catch (err) {
      console.error("Failed to approve photo:", err);
      toast.error(lang === "ar" ? "فشل حفظ الصورة" : "Failed to save photo");
    } finally {
      setIsProcessingApproval(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-black text-white border-white/20 max-h-[92dvh] sm:max-h-none" disableSwipeToClose hideDragHandle>
          {pendingPhoto ? (
            /* =========================================================================
               1. Photo Review & Approval Screen (Before Saving)
               ========================================================================= */
            <>
              <DialogHeader className="p-3 bg-neutral-900 border-b border-white/10 flex flex-row items-center justify-between z-20">
                <DialogTitle className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                  <Check className="size-4 text-emerald-400" />
                  <span>{lang === "ar" ? "معاينة واعتماد الصورة" : "Preview & Approve Photo"}</span>
                </DialogTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={isProcessingApproval}
                  onClick={handleRetake}
                  className="size-8 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                  title={lang === "ar" ? "إلغاء والعودة للكاميرا" : "Cancel & Return to Camera"}
                >
                  <X className="size-4" />
                </Button>
              </DialogHeader>

              {/* Preview Viewport with Rotation */}
              <div className="relative aspect-[3/4] w-full bg-neutral-950 flex items-center justify-center overflow-hidden p-3 select-none">
                <img
                  src={pendingPhoto.previewUrl}
                  alt="Captured Preview"
                  style={{
                    transform: `rotate(${pendingPhoto.rotation}deg)`,
                    transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
                    maxWidth: pendingPhoto.rotation % 180 !== 0 ? "72%" : "96%",
                    maxHeight: pendingPhoto.rotation % 180 !== 0 ? "72%" : "96%",
                  }}
                  className="object-contain rounded-lg shadow-2xl pointer-events-none"
                />

                {/* Top overlay reminder badge */}
                <div className="absolute top-3 inset-x-0 flex justify-center pointer-events-none px-4">
                  <span className="bg-black/75 backdrop-blur-xs text-white/90 text-[11px] font-medium px-3 py-1 rounded-full border border-white/20 shadow-xs text-center">
                    {lang === "ar"
                      ? "تحقق من وضوح الصورة والبيانات أو قم بالتدوير قبل الاعتماد"
                      : "Check image clarity & details or rotate before approval"}
                  </span>
                </div>

                {/* Processing Overlay */}
                {isProcessingApproval && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 z-50">
                    <RefreshCw className="size-8 text-brand animate-spin" />
                    <p className="text-xs text-white font-medium">
                      {lang === "ar" ? "جاري معالجة وحفظ الصورة..." : "Saving & processing photo..."}
                    </p>
                  </div>
                )}
              </div>

              {/* Preview Action Controls: Retake / Rotate / Approve */}
              <div className="p-3.5 bg-neutral-950 flex items-center justify-between gap-2.5 border-t border-white/15">
                {/* Retake Button */}
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessingApproval}
                  onClick={handleRetake}
                  className="flex-1 h-11 gap-1.5 border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white text-xs font-semibold rounded-xl active:scale-98"
                >
                  <RotateCcw className="size-4 text-amber-400" />
                  <span>{lang === "ar" ? "إعادة التقاط" : "Retake"}</span>
                </Button>

                {/* Rotate 90 deg */}
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessingApproval}
                  onClick={handleRotatePreview}
                  className="h-11 px-3.5 gap-1.5 border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white text-xs font-semibold rounded-xl active:scale-98"
                  title={lang === "ar" ? "تدوير 90°" : "Rotate 90°"}
                >
                  <RotateCw className="size-4 text-brand" />
                  <span>{lang === "ar" ? "تدوير 90°" : "Rotate"}</span>
                </Button>

                {/* Approve & Use (Closes modal & uses photo) */}
                <Button
                  type="button"
                  disabled={isProcessingApproval}
                  onClick={() => void handleApprovePhoto(false)}
                  className="flex-1 h-11 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 active:scale-98"
                >
                  <Check className="size-4 stroke-[3]" />
                  <span>{lang === "ar" ? "اعتماد واستخدام" : "Approve & Use"}</span>
                </Button>
              </div>

              {/* Sub-footer for secondary options */}
              <div className="bg-neutral-900 px-4 py-2.5 flex items-center justify-between text-xs text-white/70">
                <button
                  type="button"
                  disabled={isProcessingApproval}
                  onClick={() => void handleApprovePhoto(true)}
                  className="flex items-center gap-1.5 text-emerald-400 hover:underline font-medium text-xs disabled:opacity-50"
                >
                  <Check className="size-3.5" />
                  <span>{lang === "ar" ? "اعتماد والتقاط صورة أخرى" : "Approve & Take Another"}</span>
                </button>
                <button
                  type="button"
                  disabled={isProcessingApproval}
                  onClick={handleRetake}
                  className="text-xs text-white/60 hover:text-white hover:underline"
                >
                  {lang === "ar" ? "إلغاء والعودة للكاميرا" : "Back to Camera"}
                </button>
              </div>
            </>
          ) : (
            /* =========================================================================
               2. Live Camera Viewfinder Screen
               ========================================================================= */
            <>
              <DialogHeader className="p-3 bg-gradient-to-b from-black/90 to-transparent flex flex-row items-center justify-between z-20">
                <DialogTitle className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
                  <Camera className="size-4 text-brand" />
                  <span>{lang === "ar" ? "تصوير الصنف بالكاميرا" : "Capture Item Photo"}</span>
                </DialogTitle>
                {capturedCount > 0 && (
                  <span className="rounded-full bg-brand/30 px-2 py-0.5 text-xs text-brand font-bold border border-brand/50">
                    {capturedCount} {lang === "ar" ? "صور معتمدة" : "approved"}
                  </span>
                )}
              </DialogHeader>

              {/* Camera Viewport */}
              <div className="relative aspect-[3/4] w-full bg-neutral-950 flex items-center justify-center overflow-hidden">
                {/* Shutter flash overlay */}
                {flashAnimation && (
                  <div className="absolute inset-0 bg-white z-40 animate-out fade-out duration-150" />
                )}

                {/* Video stream */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`size-full object-cover ${facingMode === "user" ? "-scale-x-100" : ""}`}
                />

                {/* Viewfinder crosshairs overlay */}
                <div className="absolute inset-8 border border-white/25 rounded-2xl pointer-events-none flex flex-col justify-between p-4">
                  <div className="flex justify-between">
                    <span className="size-5 border-t-2 border-l-2 border-brand" />
                    <span className="size-5 border-t-2 border-r-2 border-brand" />
                  </div>
                  <p className="text-[11px] text-white/70 text-center bg-black/40 px-2 py-1 rounded-full backdrop-blur-xs self-center">
                    {lang === "ar"
                      ? "وجّه الكاميرا نحو الصنف أو كارت البيانات"
                      : "Point camera at item or label"}
                  </p>
                  <div className="flex justify-between">
                    <span className="size-5 border-b-2 border-l-2 border-brand" />
                    <span className="size-5 border-b-2 border-r-2 border-brand" />
                  </div>
                </div>

                {/* Loading Indicator */}
                {cameraLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-3">
                    <RefreshCw className="size-8 text-brand animate-spin" />
                    <p className="text-xs text-white/80">
                      {lang === "ar" ? "جاري تشغيل الكاميرا..." : "Starting camera..."}
                    </p>
                  </div>
                )}

                {/* Camera Error / Permission Fallback View */}
                {cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-neutral-950/95 text-center z-30 gap-3">
                    <div className="size-12 rounded-full bg-destructive/20 text-destructive flex items-center justify-center">
                      <AlertCircle className="size-6" />
                    </div>
                    <p className="text-xs text-white/90 leading-relaxed font-medium">
                      {cameraError}
                    </p>
                    <div className="flex flex-col gap-2 w-full pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full gap-2 border-white/30 text-white hover:bg-white/15"
                        onClick={() => void startCamera(facingMode)}
                      >
                        <RefreshCw className="size-4" />
                        <span>{lang === "ar" ? "إعادة المحاولة" : "Try Again"}</span>
                      </Button>
                      <Button
                        type="button"
                        className="w-full gap-2 bg-brand hover:bg-brand/90 text-white font-semibold"
                        onClick={() => systemCameraRef.current?.click()}
                      >
                        <Smartphone className="size-4" />
                        <span>{lang === "ar" ? "فتح كاميرا أندرويد الأصلية" : "Open System Camera"}</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Controls Bar */}
              <div className="p-4 bg-black flex items-center justify-between gap-4 border-t border-white/15">
                {/* Flashlight button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={!torchAvailable || !!cameraError}
                  onClick={toggleTorch}
                  className={`size-11 rounded-full text-white hover:bg-white/20 ${
                    torchOn ? "bg-amber-500/30 text-amber-300 ring-2 ring-amber-400" : ""
                  }`}
                  title={lang === "ar" ? "تشغيل الفلاش" : "Toggle Flashlight"}
                >
                  {torchOn ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
                </Button>

                {/* Main Shutter Button */}
                <button
                  type="button"
                  onClick={handleCapture}
                  disabled={cameraLoading || !!cameraError}
                  className="relative size-18 rounded-full border-4 border-white/90 bg-white/20 p-1 transition-transform active:scale-90 hover:scale-105 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center shadow-lg shadow-brand/40"
                  title={lang === "ar" ? "التقاط الصورة" : "Capture Photo"}
                >
                  <div className="size-full rounded-full bg-white transition-all active:bg-brand" />
                </button>

                {/* Camera Flip Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={cameraLoading || !!cameraError}
                  onClick={toggleFacingMode}
                  className="size-11 rounded-full text-white hover:bg-white/20"
                  title={lang === "ar" ? "تبديل الكاميرا" : "Flip Camera"}
                >
                  <RefreshCw className="size-5" />
                </Button>
              </div>

              {/* Footer secondary action */}
              <div className="bg-neutral-900 px-4 py-2 flex items-center justify-between text-xs text-white/70">
                <button
                  type="button"
                  onClick={() => systemCameraRef.current?.click()}
                  className="flex items-center gap-1.5 text-brand hover:underline font-medium"
                >
                  <Smartphone className="size-3.5" />
                  <span>{lang === "ar" ? "استخدام كاميرا الجهاز المباشرة" : "Use System Camera"}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="h-7 text-xs text-white/70 hover:text-white"
                >
                  {capturedCount > 0
                    ? lang === "ar"
                      ? "تم (إغلاق)"
                      : "Done"
                    : lang === "ar"
                      ? "إلغاء"
                      : "Cancel"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden System Camera Input with capture="environment" */}
      <input
        ref={systemCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleSystemCameraFile}
      />
    </>
  );
}
