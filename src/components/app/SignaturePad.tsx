import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
export interface SignatureValue {
  image: string;
  method: "drawn" | "uploaded";
}
export function SignaturePad({ onChange }: { onChange: (v: SignatureValue | null) => void }) {
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = getComputedStyle(c).color;
  }, [mode]);
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = canvas.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    setUploaded(null);
    onChange(null);
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
    <div>
      <div className="mb-2 flex gap-1" role="tablist" aria-label="Signature method">
        <Button
          type="button"
          size="sm"
          variant={mode === "draw" ? "secondary" : "ghost"}
          onClick={() => {
            clear();
            setMode("draw");
          }}
          role="tab"
          aria-selected={mode === "draw"}
        >
          <PenLine className="h-4 w-4" /> Draw
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "upload" ? "secondary" : "ghost"}
          onClick={() => {
            clear();
            setMode("upload");
          }}
          role="tab"
          aria-selected={mode === "upload"}
        >
          <Upload className="h-4 w-4" /> Upload image
        </Button>
      </div>
      {mode === "draw" ? (
        <div>
          <canvas
            ref={canvas}
            aria-label="Signature drawing area. Sign with your mouse, finger, or stylus."
            className="h-36 w-full touch-none rounded-sm border border-dashed border-input bg-card text-foreground"
            onPointerDown={(e) => {
              drawing.current = true;
              const p = pos(e);
              const ctx = canvas.current!.getContext("2d")!;
              ctx.beginPath();
              ctx.moveTo(p.x, p.y);
              canvas.current!.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const p = pos(e);
              const ctx = canvas.current!.getContext("2d")!;
              ctx.lineTo(p.x, p.y);
              ctx.stroke();
              hasInk.current = true;
            }}
            onPointerUp={() => {
              drawing.current = false;
              if (hasInk.current)
                onChange({ image: canvas.current!.toDataURL("image/png"), method: "drawn" });
            }}
          />
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Sign inside the box.</span>
            <Button type="button" size="sm" variant="ghost" onClick={clear}>
              <Eraser className="h-4 w-4" /> Clear
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <label className="block">
            <span className="sr-only">Signature image</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-sm file:mr-3 file:rounded-sm file:border file:border-input file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
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
    </div>
  );
}
export function SignatureMark({
  image,
  method,
  name,
  protectedDisplay = false,
}: {
  image?: string | undefined;
  method: string;
  name: string;
  protectedDisplay?: boolean;
}) {
  if (image && protectedDisplay) {
    return <ProtectedSignatureImage image={image} name={name} />;
  }
  if (image)
    return (
      <img src={image} alt={`Signature of ${name}`} className="h-12 max-w-[180px] object-contain" />
    );
  return <span className="text-xs italic text-muted-foreground">Signature on file ({method})</span>;
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