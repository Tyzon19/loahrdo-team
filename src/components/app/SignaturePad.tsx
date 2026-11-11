import { useEffect, useRef, useState } from "react";
import { Check, Eraser, Maximize2, PenLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
export interface SignatureValue {
  image: string;
  method: "drawn" | "uploaded";
}
function cropSignature(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3]! < 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;

  const padding = Math.round((window.devicePixelRatio || 1) * 12);
  const sourceLeft = Math.max(0, left - padding);
  const sourceTop = Math.max(0, top - padding);
  const sourceRight = Math.min(width, right + padding + 1);
  const sourceBottom = Math.min(height, bottom + padding + 1);
  const cropped = document.createElement("canvas");
  cropped.width = sourceRight - sourceLeft;
  cropped.height = sourceBottom - sourceTop;
  const croppedContext = cropped.getContext("2d");
  if (!croppedContext) return null;
  const draw = (x: number, y: number) => {
    croppedContext.drawImage(
      canvas,
      sourceLeft,
      sourceTop,
      cropped.width,
      cropped.height,
      x,
      y,
      cropped.width,
      cropped.height,
    );
  };
  const strokePadding = Math.max(1, Math.round((window.devicePixelRatio || 1) * 1.25));
  for (let y = -strokePadding; y <= strokePadding; y += 1) {
    for (let x = -strokePadding; x <= strokePadding; x += 1) {
      if (x * x + y * y <= strokePadding * strokePadding) draw(x, y);
    }
  }
  return cropped.toDataURL("image/png");
}

function configureCanvas(canvas: HTMLCanvasElement, lineWidth: number) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(rect.width * ratio);
  const height = Math.round(rect.height * ratio);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = getComputedStyle(canvas).color;
}

export function SignaturePad({ onChange }: { onChange: (v: SignatureValue | null) => void }) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [fullScreenOpen, setFullScreenOpen] = useState(false);
  const [fullScreenHasDrawing, setFullScreenHasDrawing] = useState(false);
  const [drawnPreview, setDrawnPreview] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fullScreenCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const fullScreenDrawing = useRef(false);
  const hasInk = useRef(false);
  const fullScreenHasInk = useRef(false);
  const fullScreenSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (!fullScreenOpen) return;
    const resizeCanvas = () => {
      const c = fullScreenCanvas.current;
      if (!c) return;
      const width = c.clientWidth;
      const height = c.clientHeight;
      if (!width || !height) return;
      if (width === fullScreenSize.current.width && height === fullScreenSize.current.height)
        return;

      let previous: HTMLCanvasElement | null = null;
      if (fullScreenHasInk.current && c.width && c.height) {
        previous = document.createElement("canvas");
        previous.width = c.width;
        previous.height = c.height;
        previous.getContext("2d")?.drawImage(c, 0, 0);
      }
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = getComputedStyle(c).color;
      if (previous) {
        const aspect = previous.width / previous.height;
        const drawWidth = Math.min(width, height * aspect);
        const drawHeight = drawWidth / aspect;
        ctx.drawImage(
          previous,
          0,
          0,
          previous.width,
          previous.height,
          (width - drawWidth) / 2,
          (height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
      }
      fullScreenSize.current = { width, height };
    };
    const frame = window.requestAnimationFrame(resizeCanvas);
    const observer = new ResizeObserver(resizeCanvas);
    if (fullScreenCanvas.current) observer.observe(fullScreenCanvas.current);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      fullScreenSize.current = { width: 0, height: 0 };
    };
  }, [fullScreenOpen]);

  const pos = (e: React.PointerEvent, target: HTMLCanvasElement) => {
    const r = target.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clearCanvas = (target: HTMLCanvasElement | null) => {
    const ctx = target?.getContext("2d");
    if (!target || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.restore();
  };
  const clear = () => {
    const c = canvas.current;
    clearCanvas(c);
    hasInk.current = false;
    fullScreenHasInk.current = false;
    setFullScreenHasDrawing(false);
    setDrawnPreview(null);
    setUploaded(null);
    onChange(null);
  };
  const clearFullScreen = () => {
    const c = fullScreenCanvas.current;
    clearCanvas(c);
    fullScreenHasInk.current = false;
    setFullScreenHasDrawing(false);
  };
  const useFullScreenSignature = () => {
    const c = fullScreenCanvas.current;
    if (!c || !fullScreenHasInk.current) return;
    const image = cropSignature(c);
    if (!image) return;
    setDrawnPreview(image);
    setUploaded(null);
    hasInk.current = true;
    onChange({ image, method: "drawn" });
    handleFullScreenOpenChange(false);
  };
  const handleFullScreenOpenChange = (open: boolean) => {
    setFullScreenOpen(open);
    if (!open) {
      fullScreenHasInk.current = false;
      fullScreenDrawing.current = false;
      setFullScreenHasDrawing(false);
    }
  };
  const onFile = (f?: File) => {
    setError(null);
    if (!f) return;
    if (!["image/png", "image/jpeg"].includes(f.type))
      return setError("Please upload a PNG or JPG image.");
    if (f.size > 1024 * 1024) return setError("The image must be 1 MB or smaller.");
    const rd = new FileReader();
    rd.onload = () => {
      setUploaded(rd.result as string);
      onChange({ image: rd.result as string, method: "uploaded" });
    };
    rd.readAsDataURL(f);
  };
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-col gap-2">
        <div
          className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto"
          role="tablist"
          aria-label="Signature method"
          aria-orientation="horizontal"
        >
          <Button
            type="button"
            size="default"
            variant={mode === "draw" ? "secondary" : "ghost"}
            className="min-h-10 w-full truncate px-3 text-sm sm:w-auto"
            onClick={() => {
              clear();
              setMode("draw");
            }}
            role="tab"
            aria-selected={mode === "draw"}
            aria-controls="signature-draw-panel"
          >
            <PenLine className="h-4 w-4 shrink-0" aria-hidden /> Draw signature
          </Button>
          <Button
            type="button"
            size="default"
            variant={mode === "upload" ? "secondary" : "ghost"}
            className="min-h-10 w-full truncate px-3 text-sm sm:w-auto"
            onClick={() => {
              clear();
              setMode("upload");
            }}
            role="tab"
            aria-selected={mode === "upload"}
            aria-controls="signature-upload-panel"
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden /> Upload image
          </Button>
        </div>
        {mode === "draw" && (
          <Button
            type="button"
            variant="outline"
            className="min-h-10 w-full text-sm"
            onClick={(event) => {
              event.preventDefault();
              setFullScreenOpen(true);
            }}
          >
            <Maximize2 className="h-4 w-4 shrink-0" aria-hidden />
            Open larger signing area
          </Button>
        )}
      </div>
      {mode === "draw" ? (
        <div id="signature-draw-panel" role="tabpanel" aria-label="Draw signature">
          {drawnPreview ? (
            <div className="flex h-56 items-center justify-center rounded-md border-2 border-dashed border-input bg-card p-3 sm:h-64">
              <img
                src={drawnPreview}
                alt="Drawn signature preview"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : (
            <canvas
              ref={canvas}
              aria-label="Signature drawing area. Sign with your mouse or finger."
              className="h-56 w-full touch-none rounded-md border-2 border-dashed border-input bg-card text-foreground sm:h-64"
              onPointerDown={(e) => {
                const target = canvas.current;
                if (!target) return;
                configureCanvas(target, 4);
                drawing.current = true;
                const p = pos(e, target);
                const ctx = target.getContext("2d");
                if (!ctx) return;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                target.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const target = canvas.current;
                if (!drawing.current || !target) return;
                const p = pos(e, target);
                const ctx = target.getContext("2d");
                if (!ctx) return;
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                hasInk.current = true;
              }}
              onPointerUp={() => {
                drawing.current = false;
                const target = canvas.current;
                if (hasInk.current && target) {
                  const image = target.toDataURL("image/png");
                  setDrawnPreview(image);
                  onChange({ image, method: "drawn" });
                }
              }}
            />
          )}
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{drawnPreview ? "Signature ready." : "Sign inside the box."}</span>
            {drawnPreview && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDrawnPreview(null);
                  hasInk.current = false;
                  onChange(null);
                }}
              >
                Redraw
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={clear}>
              <Eraser className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
      ) : (
        <div id="signature-upload-panel" role="tabpanel" aria-label="Upload signature image">
          <label className="block">
            <span className="sr-only">Signature image</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full min-w-0 text-sm file:mr-2 file:max-w-[65%] file:truncate file:rounded-sm file:border file:border-input file:bg-secondary file:px-2 file:py-1.5 file:text-xs sm:file:mr-3 sm:file:max-w-none sm:file:px-3 sm:file:text-sm"
            />
          </label>
          <p className="mt-1 text-xs text-muted-foreground">PNG or JPG, up to 1 MB.</p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
          {uploaded && (
            <img
              src={uploaded}
              alt="Uploaded signature preview"
              className="mt-2 h-24 rounded-sm border bg-card object-contain p-1"
            />
          )}
        </div>
      )}
      <Dialog open={fullScreenOpen} onOpenChange={handleFullScreenOpenChange}>
        <DialogContent className="flex h-[100svh] w-screen max-w-none flex-col gap-0 p-0 sm:h-[min(85vh,720px)] sm:max-h-[85vh] sm:w-[90vw] sm:max-w-2xl sm:rounded-xl sm:border">
          <DialogHeader className="border-b px-4 pr-12 pb-3 pt-4 text-left">
            <DialogTitle>Sign here</DialogTitle>
            <DialogDescription>
              Write your signature inside the box using your mouse, trackpad, finger.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              <div className="relative h-full min-h-[22rem] w-full sm:min-h-[26rem]">
                <canvas
                  ref={fullScreenCanvas}
                  aria-label="Full-screen signature drawing area. Sign with your mouse or finger."
                  className="absolute inset-0 h-full w-full touch-none rounded-lg border-2 border-dashed border-input bg-card text-foreground"
                  onPointerDown={(e) => {
                    const target = fullScreenCanvas.current;
                    if (!target) return;
                    configureCanvas(target, 5);
                    fullScreenDrawing.current = true;
                    const p = pos(e, target);
                    const ctx = target.getContext("2d");
                    if (!ctx) return;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    target.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const target = fullScreenCanvas.current;
                    if (!fullScreenDrawing.current || !target) return;
                    const p = pos(e, target);
                    const ctx = target.getContext("2d");
                    if (!ctx) return;
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                    if (!fullScreenHasInk.current) {
                      fullScreenHasInk.current = true;
                      setFullScreenHasDrawing(true);
                    }
                  }}
                  onPointerUp={() => {
                    fullScreenDrawing.current = false;
                  }}
                  onPointerCancel={() => {
                    fullScreenDrawing.current = false;
                  }}
                />
                <span className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-dotted border-muted-foreground/40" />
              </div>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Sign above the dotted line. Tap &ldquo;Use signature&rdquo; when finished.
            </p>
          </div>
          <DialogFooter className="flex-row border-t p-3 sm:px-6">
            <Button type="button" variant="outline" className="flex-1" onClick={clearFullScreen}>
              <Eraser className="h-4 w-4" aria-hidden />
              Clear
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!fullScreenHasDrawing}
              onClick={useFullScreenSignature}
            >
              <Check className="h-4 w-4" aria-hidden />
              Use signature
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function SignatureMark({
  image,
  method,
  name,
  protectedDisplay = false,
  scale = 1,
}: {
  image?: string | undefined;
  method: string;
  name: string;
  protectedDisplay?: boolean;
  scale?: number;
}) {
  if (image && protectedDisplay) {
    return <ProtectedSignatureImage image={image} name={name} />;
  }
  if (image) return <SignatureImage image={image} method={method} name={name} scale={scale} />;
  return <span className="text-xs italic text-muted-foreground">Signature on file ({method})</span>;
}
function SignatureImage({
  image,
  method,
  name,
  scale,
}: {
  image: string;
  method: string;
  name: string;
  scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureImage = new Image();
    signatureImage.onload = () => {
      const width = signatureImage.naturalWidth;
      const height = signatureImage.naturalHeight;
      const imageScale = Math.min((180 * scale) / width, (48 * scale) / height);
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width * imageScale}px`;
      canvas.style.height = `${height * imageScale}px`;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(signatureImage, 0, 0);
    };
    signatureImage.src = image;
  }, [image, method, scale]);
  return <canvas ref={canvasRef} role="img" aria-label={`Signature of ${name}`} />;
}
function ProtectedSignatureImage({ image, name }: { image: string; name: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureImage = new Image();
    signatureImage.onload = () => {
      const scale = Math.min(180 / signatureImage.naturalWidth, 48 / signatureImage.naturalHeight);
      canvas.width = signatureImage.naturalWidth;
      canvas.height = signatureImage.naturalHeight;
      canvas.style.width = `${signatureImage.naturalWidth * scale}px`;
      canvas.style.height = `${signatureImage.naturalHeight * scale}px`;
      const context = canvas.getContext("2d");
      if (context) context.drawImage(signatureImage, 0, 0);
    };
    signatureImage.src = image;
  }, [image]);
  return (
    <div
      className="signature-protected select-none"
      onContextMenu={(event) => event.preventDefault()}
      onDragStart={(event) => event.preventDefault()}
      onCopy={(event) => event.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Signature of ${name}`}
        draggable={false}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
      />
    </div>
  );
}
