"use client";

import AdvancedIdCardStudio from "@/components/AdvancedIdCardStudio";
import PassportPhotoStudio from "@/components/PassportPhotoStudio";
import clsx from "clsx";
import Konva from "konva";
import { jsPDF } from "jspdf";
import { flushSync } from "react-dom";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crop,
  Download,
  FileImage,
  FileText,
  ImagePlus,
  Keyboard,
  Maximize2,
  Moon,
  MousePointer2,
  Move,
  Printer,
  RefreshCcw,
  Replace,
  RotateCcw,
  RotateCw,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wand2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import React, {
  ChangeEvent,
  DragEvent,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Image as KonvaImage, Layer, Rect, Stage, Transformer } from "react-konva";

type Side = "front" | "back";

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CardImage = {
  id: Side;
  side: Side;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  cropEnabled: boolean;
  crop?: CropBox;
};

type QualityLevel = "excellent" | "good" | "warning" | "poor";

const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 3000;
const PRINT_DPI = 600;
const PRINT_WIDTH_IN = 4;
const PRINT_HEIGHT_IN = 5;
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png"];
const ORDER: Side[] = ["front", "back"];

const SIDE_LABEL: Record<Side, string> = {
  front: "Front side",
  back: "Back side"
};

const SIDE_HINT: Record<Side, string> = {
  front: "Placed at the top of the 4×5 sheet",
  back: "Placed below with equal spacing"
};

function bytesToSize(bytes: number) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageMeta(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });
}

function centerCoverCrop(naturalWidth: number, naturalHeight: number, targetWidth: number, targetHeight: number): CropBox {
  const sourceRatio = naturalWidth / naturalHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const width = naturalHeight * targetRatio;
    return {
      x: (naturalWidth - width) / 2,
      y: 0,
      width,
      height: naturalHeight
    };
  }

  const height = naturalWidth / targetRatio;
  return {
    x: 0,
    y: (naturalHeight - height) / 2,
    width: naturalWidth,
    height
  };
}

function getQuality(card: CardImage): { dpi: number; level: QualityLevel; label: string; tone: string } {
  const printableWidthInches = Math.max(card.width / PRINT_DPI, 0.01);
  const printableHeightInches = Math.max(card.height / PRINT_DPI, 0.01);
  const effectiveDpi = Math.floor(
    Math.min(card.naturalWidth / printableWidthInches, card.naturalHeight / printableHeightInches)
  );

  if (effectiveDpi >= 300) {
    return {
      dpi: effectiveDpi,
      level: "excellent",
      label: "300+ DPI print-ready",
      tone: "text-emerald-700 bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30"
    };
  }
  if (effectiveDpi >= 220) {
    return {
      dpi: effectiveDpi,
      level: "good",
      label: "Good photo quality",
      tone: "text-blue-700 bg-blue-50 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30"
    };
  }
  if (effectiveDpi >= 150) {
    return {
      dpi: effectiveDpi,
      level: "warning",
      label: "Acceptable, avoid enlarging",
      tone: "text-amber-700 bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30"
    };
  }
  return {
    dpi: effectiveDpi,
    level: "poor",
    label: "Low resolution warning",
    tone: "text-rose-700 bg-rose-50 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
  };
}

function autoLayout(cards: CardImage[], layoutScalePercent = 100): CardImage[] {
  const existing = ORDER.map((side) => cards.find((card) => card.side === side)).filter(Boolean) as CardImage[];
  if (existing.length === 0) return cards;

  const layoutScale = Math.min(1.2, Math.max(0.7, layoutScalePercent / 100));
  const maxWidth = (CANVAS_WIDTH - 240) * layoutScale;
  const reservedEqualGaps = 360;
  const maxCombinedHeight = CANVAS_HEIGHT - reservedEqualGaps;

  if (existing.length === 1) {
    const card = existing[0];
    const scale = Math.min(maxWidth / card.naturalWidth, (1640 * layoutScale) / card.naturalHeight);
    const width = Math.round(card.naturalWidth * scale);
    const height = Math.round(card.naturalHeight * scale);

    return cards.map((item) =>
      item.id === card.id
        ? {
            ...item,
            x: Math.round((CANVAS_WIDTH - width) / 2),
            y: Math.round((CANVAS_HEIGHT - height) / 2),
            width,
            height,
            rotation: 0,
            cropEnabled: false,
            crop: undefined
          }
        : item
    );
  }

  const planned = existing.map((card) => {
    const scale = Math.min(maxWidth / card.naturalWidth, (1300 * layoutScale) / card.naturalHeight);
    return {
      id: card.id,
      width: card.naturalWidth * scale,
      height: card.naturalHeight * scale
    };
  });

  const combinedHeight = planned.reduce((total, item) => total + item.height, 0);
  const shrink = combinedHeight > maxCombinedHeight ? maxCombinedHeight / combinedHeight : 1;
  let y = (CANVAS_HEIGHT - combinedHeight * shrink) / 3;

  const patches = new Map<Side, Pick<CardImage, "x" | "y" | "width" | "height" | "rotation" | "cropEnabled" | "crop">>();
  planned.forEach((item, index) => {
    const width = Math.round(item.width * shrink);
    const height = Math.round(item.height * shrink);
    patches.set(item.id, {
      x: Math.round((CANVAS_WIDTH - width) / 2),
      y: Math.round(y),
      width,
      height,
      rotation: 0,
      cropEnabled: false,
      crop: undefined
    });
    y += height + (CANVAS_HEIGHT - combinedHeight * shrink) / 3;

    if (index === 0 && planned.length === 2) {
      // The formula above creates equal top, middle, and bottom white space.
    }
  });

  return cards.map((card) => ({ ...card, ...(patches.get(card.id) ?? {}) }));
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function createDemoCard(side: Side): CardImage {
  const width = 1014;
  const height = 638;
  const demoScale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * demoScale;
  canvas.height = height * demoScale;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas is not available in this browser.");
  }

  ctx.scale(demoScale, demoScale);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, side === "front" ? "#1d4ed8" : "#0f172a");
  gradient.addColorStop(0.55, side === "front" ? "#2563eb" : "#1e293b");
  gradient.addColorStop(1, side === "front" ? "#06b6d4" : "#334155");

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 0, 0, width, height, 42);
  ctx.fill();
  ctx.save();
  roundRect(ctx, 18, 18, width - 36, height - 36, 34);
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(18, 18, width - 36, height - 36);

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  for (let i = -120; i < width; i += 150) {
    ctx.beginPath();
    ctx.ellipse(i + 110, 110, 170, 42, -0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (side === "front") {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundRect(ctx, 58, 70, 300, 394, 30);
    ctx.fill();

    const photoGradient = ctx.createLinearGradient(80, 100, 336, 430);
    photoGradient.addColorStop(0, "#dbeafe");
    photoGradient.addColorStop(1, "#93c5fd");
    ctx.fillStyle = photoGradient;
    roundRect(ctx, 80, 96, 256, 308, 24);
    ctx.fill();

    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.arc(208, 200, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#bfdbfe";
    ctx.beginPath();
    ctx.arc(208, 180, 34, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, 138, 250, 140, 95, 50);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 42px Arial";
    ctx.fillText("ACME CORPORATION", 400, 105);
    ctx.font = "700 24px Arial";
    ctx.fillText("EMPLOYEE ID CARD", 402, 145);

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    roundRect(ctx, 400, 190, 535, 282, 28);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.font = "900 46px Arial";
    ctx.fillText("AARAV SHARMA", 430, 255);
    ctx.font = "700 26px Arial";
    ctx.fillStyle = "#2563eb";
    ctx.fillText("Senior Operations Manager", 432, 300);

    ctx.fillStyle = "#334155";
    ctx.font = "700 22px Arial";
    ctx.fillText("ID No: ACME-2026-0148", 432, 354);
    ctx.fillText("Dept: Administration", 432, 395);
    ctx.fillText("Valid Till: 31 Dec 2028", 432, 436);

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 58, 506, 877, 62, 22);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = "800 24px Arial";
    ctx.fillText("AUTHORIZED IDENTIFICATION · FRONT SIDE", 86, 546);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 42px Arial";
    ctx.fillText("ACME CORPORATION", 64, 96);
    ctx.font = "700 22px Arial";
    ctx.fillText("BACK SIDE · TERMS / EMERGENCY / BARCODE", 66, 132);

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, 64, 175, 880, 228, 28);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.font = "800 26px Arial";
    ctx.fillText("If found, please return this card to:", 100, 230);
    ctx.font = "600 23px Arial";
    ctx.fillText("ACME Corporation, Corporate Park, New Delhi", 100, 275);
    ctx.fillText("Emergency: +91 98765 43210  ·  security@acme.example", 100, 318);
    ctx.fillText("This card remains company property and is non-transferable.", 100, 361);

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 64, 444, 590, 98, 20);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    for (let x = 94; x < 620; x += 14) {
      const barHeight = 44 + ((x * 17) % 38);
      const barWidth = x % 4 === 0 ? 7 : 4;
      ctx.fillRect(x, 462, barWidth, barHeight);
    }
    ctx.font = "700 18px Arial";
    ctx.fillText("ACME-2026-0148", 270, 528);

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 708, 444, 236, 98, 20);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = "900 28px Arial";
    ctx.fillText("600 DPI", 762, 492);
    ctx.font = "700 16px Arial";
    ctx.fillText("DEMO BACK IMAGE", 748, 522);
  }

  ctx.restore();

  ctx.strokeStyle = "rgba(15,23,42,0.16)";
  ctx.lineWidth = 5;
  roundRect(ctx, 2.5, 2.5, width - 5, height - 5, 42);
  ctx.stroke();

  const dataUrl = canvas.toDataURL("image/png");
  return {
    id: side,
    side,
    name: `${side}-demo-id-card.png`,
    mime: "image/png",
    size: Math.round((dataUrl.length * 3) / 4),
    dataUrl,
    naturalWidth: canvas.width,
    naturalHeight: canvas.height,
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    rotation: 0,
    cropEnabled: false
  };
}

function useLoadedImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }

    let cancelled = false;
    const nextImage = new window.Image();
    nextImage.decoding = "async";
    nextImage.onload = () => {
      if (!cancelled) setImage(nextImage);
    };
    nextImage.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return image;
}

function EditableImage({
  card,
  selected,
  onSelect,
  onChange
}: {
  card: CardImage;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CardImage>) => void;
}) {
  const image = useLoadedImage(card.dataUrl);
  const imageRef = useRef<Konva.Image>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (!selected || !transformerRef.current || !imageRef.current) return;
    transformerRef.current.nodes([imageRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selected, image]);

  const finishTransform = () => {
    const node = imageRef.current;
    if (!node) return;

    const width = Math.max(30, node.width() * node.scaleX());
    const height = Math.max(30, node.height() * node.scaleY());
    const patch: Partial<CardImage> = {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.round(width),
      height: Math.round(height),
      rotation: Math.round(node.rotation())
    };

    if (card.cropEnabled) {
      patch.crop = centerCoverCrop(card.naturalWidth, card.naturalHeight, width, height);
    }

    node.scaleX(1);
    node.scaleY(1);
    onChange(patch);
  };

  return (
    <>
      <KonvaImage
        ref={imageRef}
        image={image ?? undefined}
        x={card.x}
        y={card.y}
        width={card.width}
        height={card.height}
        rotation={card.rotation}
        crop={card.cropEnabled ? card.crop : undefined}
        draggable
        perfectDrawEnabled
        imageSmoothingEnabled
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={onSelect}
        onDragEnd={(event) =>
          onChange({
            x: Math.round(event.target.x()),
            y: Math.round(event.target.y())
          })
        }
        onTransformStart={onSelect}
        onTransformEnd={finishTransform}
      />
      {selected && (
        <Transformer
          ref={transformerRef}
          name="editor-transformer"
          rotateEnabled
          borderStroke="#2563eb"
          anchorStroke="#2563eb"
          anchorFill="#ffffff"
          anchorSize={12}
          anchorCornerRadius={6}
          borderDash={[8, 5]}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 30 || newBox.height < 30) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  title,
  variant = "secondary"
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" &&
          "bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:-translate-y-0.5 hover:bg-blue-500 focus:ring-blue-500/25",
        variant === "secondary" &&
          "border border-slate-200 bg-white/80 text-slate-700 hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-blue-500/50 dark:hover:text-blue-200",
        variant === "danger" &&
          "border border-rose-200 bg-rose-50 text-rose-700 hover:-translate-y-0.5 hover:bg-rose-100 focus:ring-rose-500/15 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
        variant === "ghost" &&
          "text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus:ring-slate-500/10 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

function QualityPill({ card }: { card: CardImage }) {
  const quality = getQuality(card);
  const Icon = quality.level === "poor" || quality.level === "warning" ? AlertTriangle : CheckCircle2;

  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1", quality.tone)}>
      <Icon className="h-3.5 w-3.5" />
      {quality.dpi} DPI · {quality.label}
    </span>
  );
}

function UploadBox({
  side,
  card,
  inputRef,
  onFile,
  onRemove
}: {
  side: Side;
  card?: CardImage;
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (side: Side, file: File) => void;
  onRemove: (side: Side) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(side, file);
    event.target.value = "";
  };

  const dropFile = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(side, file);
  };

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={dropFile}
      className={clsx(
        "group relative overflow-hidden rounded-3xl border border-dashed p-4 transition-all duration-300",
        dragging
          ? "border-blue-500 bg-blue-500/10 shadow-glow"
          : "border-slate-300 bg-white/55 hover:border-blue-400 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-950/35 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10"
      )}
    >
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={pickFile} />

      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border transition-all",
            card
              ? "border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
              : "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
          )}
        >
          {card ? (
            <img src={card.dataUrl} alt={`${SIDE_LABEL[side]} preview`} className="h-full w-full object-contain" />
          ) : (
            <ImagePlus className="h-8 w-8" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-950 dark:text-white">{SIDE_LABEL[side]}</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{SIDE_HINT[side]}</p>
            </div>
            {card && <QualityPill card={card} />}
          </div>

          {card ? (
            <div className="mt-3 space-y-2 text-xs text-slate-500 dark:text-slate-400">
              <p className="truncate font-semibold text-slate-700 dark:text-slate-200">{card.name}</p>
              <p>
                {card.naturalWidth}×{card.naturalHeight}px · {bytesToSize(card.size)} · {card.mime.replace("image/", "").toUpperCase()}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <ToolbarButton onClick={() => inputRef.current?.click()} title="Replace image">
                  <Replace className="h-4 w-4" /> Replace
                </ToolbarButton>
                <ToolbarButton onClick={() => onRemove(side)} variant="danger" title="Remove image">
                  <Trash2 className="h-4 w-4" /> Remove
                </ToolbarButton>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-blue-600 dark:bg-white dark:text-slate-950 dark:hover:bg-blue-100"
              >
                <Upload className="h-4 w-4" /> Upload JPG / PNG
              </button>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Drag and drop supported. Preview appears instantly.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IdCardPrintEditor() {
  const [workspaceMode, setWorkspaceMode] = useState<"advancedId" | "id" | "passport">("advancedId");
  const [cards, setCards] = useState<CardImage[]>([]);
  const [activeId, setActiveId] = useState<Side | null>(null);
  const [displayScale, setDisplayScale] = useState(0.18);
  const [layoutScale, setLayoutScale] = useState(100);
  const [darkMode, setDarkMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [printDataUrl, setPrintDataUrl] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(0.44);

  const stageRef = useRef<Konva.Stage>(null);
  const canvasViewportRef = useRef<HTMLDivElement>(null);
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  const cardMap = useMemo(() => new Map(cards.map((card) => [card.side, card])), [cards]);
  const activeCard = activeId ? cardMap.get(activeId) : undefined;
  const complete = Boolean(cardMap.get("front") && cardMap.get("back"));

  useEffect(() => {
    const fitPreviewToScreen = () => {
      const container = canvasViewportRef.current;
      const availableWidth = Math.max(260, (container?.clientWidth ?? window.innerWidth) - 76);
      const comfortableHeight = Math.max(480, window.innerHeight - 260);
      const widthScale = availableWidth / CANVAS_WIDTH;
      const heightScale = comfortableHeight / CANVAS_HEIGHT;
      const nextScale = Math.min(0.28, Math.max(0.1, Math.min(widthScale, heightScale)));
      setDisplayScale(Number(nextScale.toFixed(2)));
    };

    fitPreviewToScreen();
    const observer = new ResizeObserver(fitPreviewToScreen);
    if (canvasViewportRef.current) observer.observe(canvasViewportRef.current);
    window.addEventListener("resize", fitPreviewToScreen);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fitPreviewToScreen);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);

  const updateCard = useCallback((side: Side, patch: Partial<CardImage>) => {
    setCards((previous) => previous.map((card) => (card.side === side ? { ...card, ...patch } : card)));
  }, []);

  const setCardsAuto = useCallback(
    (nextCards: CardImage[]) => {
      setCards(autoLayout(nextCards, layoutScale));
    },
    [layoutScale]
  );

  const loadDemoProject = useCallback(() => {
    try {
      const front = createDemoCard("front");
      const back = createDemoCard("back");
      setCards(autoLayout([front, back], layoutScale));
      setActiveId("front");
      setMessage("Demo front and back ID cards loaded. You can drag, resize, rotate, crop, preview, print, and export now.");
    } catch {
      setMessage("Demo images could not be generated in this browser.");
    }
  }, [layoutScale]);

  const handleFile = useCallback(
    async (side: Side, file: File) => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setMessage("Please upload a JPG, JPEG, or PNG image.");
        return;
      }

      try {
        const dataUrl = await readFileAsDataURL(file);
        const meta = await loadImageMeta(dataUrl);
        const incoming: CardImage = {
          id: side,
          side,
          name: file.name,
          mime: file.type,
          size: file.size,
          dataUrl,
          naturalWidth: meta.width,
          naturalHeight: meta.height,
          x: 0,
          y: 0,
          width: meta.width,
          height: meta.height,
          rotation: 0,
          cropEnabled: false
        };

        setCards((previous) => {
          const withoutSide = previous.filter((card) => card.side !== side);
          return autoLayout([...withoutSide, incoming].sort((a, b) => ORDER.indexOf(a.side) - ORDER.indexOf(b.side)), layoutScale);
        });
        setActiveId(side);
        setMessage(`${SIDE_LABEL[side]} uploaded and auto-fitted at 600 DPI canvas resolution.`);
      } catch {
        setMessage("The image could not be loaded. Try another JPG or PNG file.");
      }
    },
    [layoutScale]
  );

  const removeImage = useCallback(
    (side: Side) => {
      setCards((previous) => autoLayout(previous.filter((card) => card.side !== side), layoutScale));
      setActiveId((current) => (current === side ? null : current));
    },
    [layoutScale]
  );

  const exportStage = useCallback((mimeType: "image/png" | "image/jpeg", quality = 1) => {
    const stage = stageRef.current;
    if (!stage) return null;

    const transformers = stage.find(".editor-transformer");
    const previousVisibility = transformers.map((node) => node.visible());
    transformers.forEach((node) => node.hide());
    stage.batchDraw();

    const dataUrl = stage.toDataURL({
      mimeType,
      quality,
      pixelRatio: 1
    });

    transformers.forEach((node, index) => node.visible(previousVisibility[index] ?? true));
    stage.batchDraw();
    return dataUrl;
  }, []);

  const downloadPNG = useCallback(() => {
    const dataUrl = exportStage("image/png");
    if (!dataUrl) return;
    downloadDataUrl(dataUrl, "id-card-4x5-600dpi.png");
    setMessage("Downloaded ultra-HD print-ready PNG at 2400×3000 px.");
  }, [exportStage]);

  const downloadJPG = useCallback(() => {
    const dataUrl = exportStage("image/jpeg", 1);
    if (!dataUrl) return;
    downloadDataUrl(dataUrl, "id-card-4x5-600dpi.jpg");
    setMessage("Downloaded ultra-HD high-quality JPG at 2400×3000 px.");
  }, [exportStage]);

  const downloadPDF = useCallback(() => {
    const dataUrl = exportStage("image/png");
    if (!dataUrl) return;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "in",
      format: [PRINT_WIDTH_IN, PRINT_HEIGHT_IN],
      compress: false,
      precision: 16
    });
    pdf.setProperties({
      title: "ID Card 4×5 Inch 600 DPI Print Sheet",
      subject: "Front and back ID card images on a single print-ready white page",
      creator: "Professional ID Card Print Editor",
      author: "Professional ID Card Print Editor",
      keywords: "id-card, 4x5, 600-dpi, ultra-hd, print-ready, no-margin"
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, PRINT_WIDTH_IN, PRINT_HEIGHT_IN, undefined, "NONE");
    pdf.setDisplayMode("fullpage", "single", null);
    pdf.save("id-card-4x5-600dpi.pdf");
    setMessage(`Downloaded exact 4×5 inch PDF at ${layoutScale}% card layout scale.`);
  }, [exportStage, layoutScale]);

  const openPrintPreview = useCallback(() => {
    const dataUrl = exportStage("image/png");
    if (!dataUrl) return;
    setPreviewDataUrl(dataUrl);
    setPreviewOpen(true);
  }, [exportStage]);

  const printSheet = useCallback(() => {
    const dataUrl = exportStage("image/png");
    if (!dataUrl) return;
    flushSync(() => setPrintDataUrl(dataUrl));
    window.print();
  }, [exportStage]);

  const resetLayout = useCallback(() => {
    setCards((previous) => autoLayout(previous, layoutScale));
    setMessage(`Layout updated: ${layoutScale}% card size, front on top, back below, equal spacing, center aligned.`);
  }, [layoutScale]);

  const autoFitImages = useCallback(() => {
    setCardsAuto(cards);
    setMessage("Images auto-fitted inside the printable 4×5 area.");
  }, [cards, setCardsAuto]);

  const nudgeActive = useCallback(
    (dx: number, dy: number) => {
      if (!activeId) return;
      setCards((previous) =>
        previous.map((card) => (card.side === activeId ? { ...card, x: card.x + dx, y: card.y + dy } : card))
      );
    },
    [activeId]
  );

  const zoomActive = useCallback(
    (factor: number) => {
      if (!activeId) return;
      setCards((previous) =>
        previous.map((card) => {
          if (card.side !== activeId) return card;
          const nextWidth = Math.max(40, Math.round(card.width * factor));
          const nextHeight = Math.max(40, Math.round(card.height * factor));
          const nextCard: CardImage = {
            ...card,
            x: Math.round(card.x - (nextWidth - card.width) / 2),
            y: Math.round(card.y - (nextHeight - card.height) / 2),
            width: nextWidth,
            height: nextHeight
          };
          if (nextCard.cropEnabled) {
            nextCard.crop = centerCoverCrop(nextCard.naturalWidth, nextCard.naturalHeight, nextWidth, nextHeight);
          }
          return nextCard;
        })
      );
    },
    [activeId]
  );

  const rotateActive = useCallback(
    (degrees: number) => {
      if (!activeId) return;
      setCards((previous) =>
        previous.map((card) => (card.side === activeId ? { ...card, rotation: (card.rotation + degrees) % 360 } : card))
      );
    },
    [activeId]
  );

  const toggleCropActive = useCallback(() => {
    if (!activeId) return;
    setCards((previous) =>
      previous.map((card) => {
        if (card.side !== activeId) return card;
        const cropEnabled = !card.cropEnabled;
        return {
          ...card,
          cropEnabled,
          crop: cropEnabled ? centerCoverCrop(card.naturalWidth, card.naturalHeight, card.width, card.height) : undefined
        };
      })
    );
  }, [activeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        downloadPNG();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        resetLayout();
        return;
      }

      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        nudgeActive(0, -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        nudgeActive(0, step);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        nudgeActive(-step, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        nudgeActive(step, 0);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomActive(1.03);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomActive(0.97);
      } else if (event.key === "[" || event.key.toLowerCase() === "q") {
        event.preventDefault();
        rotateActive(-1);
      } else if (event.key === "]" || event.key.toLowerCase() === "e") {
        event.preventDefault();
        rotateActive(1);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (activeId) {
          event.preventDefault();
          removeImage(activeId);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeId, downloadPNG, nudgeActive, removeImage, resetLayout, rotateActive, zoomActive]);

  const selectedQuality = activeCard ? getQuality(activeCard) : null;

  if (workspaceMode === "advancedId") {
    return <AdvancedIdCardStudio onSwitchClassic={() => setWorkspaceMode("id")} onSwitchPassport={() => setWorkspaceMode("passport")} />;
  }

  if (workspaceMode === "passport") {
    return <PassportPhotoStudio onSwitchToId={() => setWorkspaceMode("advancedId")} />;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0,transparent_38%),radial-gradient(circle_at_top_right,#ede9fe_0,transparent_34%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-4 py-5 text-slate-950 transition-colors duration-500 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.22)_0,transparent_32%),radial-gradient(circle_at_top_right,rgba(168,85,247,.18)_0,transparent_32%),linear-gradient(180deg,#020617,#0f172a)] dark:text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 animate-float rounded-full bg-blue-400/20 blur-3xl dark:bg-blue-500/10" />
      <div className="pointer-events-none absolute bottom-16 right-12 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-500/10" />

      <div className="relative mx-auto max-w-[1800px]">
        <header className="mb-5 flex flex-col gap-4 rounded-[2rem] border border-white/60 bg-white/55 p-4 shadow-soft backdrop-blur-2xl dark:border-slate-700/40 dark:bg-slate-950/45 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
              <Sparkles className="h-3.5 w-3.5" /> Print Studio · 600 DPI
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Professional ID Card Print Editor
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Build one ultra-high-resolution 4×5 inch page containing the front and back ID card images on a pure white background. Export is always 2400×3000 px at 600 DPI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToolbarButton onClick={() => setWorkspaceMode("advancedId")} title="Open advanced ID card studio">
              <Settings2 className="h-4 w-4" /> Advanced Studio
            </ToolbarButton>
            <ToolbarButton onClick={() => setWorkspaceMode("passport")} title="Open passport size photo maker">
              <Camera className="h-4 w-4" /> Passport 8 Photos
            </ToolbarButton>
            <ToolbarButton onClick={loadDemoProject} title="Load sample front and back ID cards">
              <Sparkles className="h-4 w-4" /> Load Demo
            </ToolbarButton>
            <ToolbarButton onClick={() => setDarkMode((value) => !value)} title="Toggle dark mode">
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {darkMode ? "Light" : "Dark"}
            </ToolbarButton>
            <ToolbarButton onClick={openPrintPreview} disabled={!cards.length} title="Open print preview">
              <Maximize2 className="h-4 w-4" /> Preview
            </ToolbarButton>
            <ToolbarButton onClick={printSheet} disabled={!cards.length} variant="primary" title="Print exact 4×5 sheet">
              <Printer className="h-4 w-4" /> Print
            </ToolbarButton>
          </div>
        </header>

        {message && (
          <div className="fixed right-5 top-5 z-50 max-w-md animate-float rounded-2xl border border-blue-200 bg-white/90 p-4 text-sm font-semibold text-slate-800 shadow-glow backdrop-blur-xl dark:border-blue-500/30 dark:bg-slate-950/90 dark:text-slate-100">
            {message}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)_360px]">
          <aside className="glass-card rounded-[2rem] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black">Upload Images</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">JPG, JPEG, PNG · instant preview</p>
              </div>
              <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-600/25">
                <Upload className="h-5 w-5" />
              </div>
            </div>

            <div className="space-y-4">
              <UploadBox side="front" card={cardMap.get("front")} inputRef={frontInputRef} onFile={handleFile} onRemove={removeImage} />
              <UploadBox side="back" card={cardMap.get("back")} inputRef={backInputRef} onFile={handleFile} onRemove={removeImage} />
            </div>

            <button
              type="button"
              onClick={loadDemoProject}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:shadow-glow"
            >
              <Sparkles className="h-4 w-4" /> Load demo images to test everything
            </button>

            <div className="mt-5 rounded-3xl border border-slate-200 bg-white/55 p-4 dark:border-slate-700 dark:bg-slate-950/35">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-black">
                <Keyboard className="h-4 w-4 text-blue-600" /> Keyboard shortcuts
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                <Shortcut label="Move" keys="Arrows" />
                <Shortcut label="Fast move" keys="Shift + Arrows" />
                <Shortcut label="Zoom image" keys="+ / -" />
                <Shortcut label="Rotate" keys="[ / ]" />
                <Shortcut label="Reset" keys="Ctrl + 0" />
                <Shortcut label="PNG export" keys="Ctrl + S" />
              </div>
            </div>
          </aside>

          <section className="glass-card overflow-hidden rounded-[2rem]">
            <div className="flex flex-col gap-3 border-b border-white/60 p-4 dark:border-slate-700/50 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 className="text-lg font-black">Live 4×5 Print Canvas</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  White background · 4×5 inches · {CANVAS_WIDTH}×{CANVAS_HEIGHT}px · {PRINT_DPI} DPI
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolbarButton onClick={() => setDisplayScale((value) => Math.max(0.1, +(value - 0.04).toFixed(2)))} title="Zoom preview out">
                  <ZoomOut className="h-4 w-4" /> Preview
                </ToolbarButton>
                <ToolbarButton onClick={() => setDisplayScale((value) => Math.min(0.78, +(value + 0.04).toFixed(2)))} title="Zoom preview in">
                  <ZoomIn className="h-4 w-4" /> {Math.round(displayScale * 100)}%
                </ToolbarButton>
                <ToolbarButton onClick={resetLayout} disabled={!cards.length} title="Reset auto layout">
                  <RefreshCcw className="h-4 w-4" /> Reset
                </ToolbarButton>
              </div>
            </div>

            <div ref={canvasViewportRef} className="fine-grid min-h-[520px] overflow-y-auto overflow-x-hidden p-3 sm:min-h-[640px] sm:p-5 lg:p-6">
              <div className="mx-auto w-fit rounded-[1.5rem] bg-slate-900/10 p-2 shadow-2xl dark:bg-black/35 sm:rounded-[2rem] sm:p-4">
                <div
                  className="relative overflow-hidden rounded-sm bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.1),0_30px_80px_rgba(15,23,42,0.22)]"
                  style={{
                    width: CANVAS_WIDTH * displayScale,
                    height: CANVAS_HEIGHT * displayScale
                  }}
                >
                  <div
                    style={{
                      width: CANVAS_WIDTH,
                      height: CANVAS_HEIGHT,
                      transform: `scale(${displayScale})`,
                      transformOrigin: "top left"
                    }}
                  >
                    <Stage
                      ref={stageRef}
                      width={CANVAS_WIDTH}
                      height={CANVAS_HEIGHT}
                      onMouseDown={(event) => {
                        if (event.target === event.target.getStage()) setActiveId(null);
                      }}
                      onTouchStart={(event) => {
                        if (event.target === event.target.getStage()) setActiveId(null);
                      }}
                    >
                      <Layer listening={false}>
                        <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#FFFFFF" />
                      </Layer>
                      <Layer>
                        {ORDER.map((side) => {
                          const card = cardMap.get(side);
                          if (!card) return null;
                          return (
                            <EditableImage
                              key={`${card.side}-${card.name}`}
                              card={card}
                              selected={activeId === side}
                              onSelect={() => setActiveId(side)}
                              onChange={(patch) => updateCard(side, patch)}
                            />
                          );
                        })}
                      </Layer>
                    </Stage>
                  </div>

                  {!cards.length && (
                    <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                      <div className="rounded-3xl border border-dashed border-blue-300 bg-white/85 p-8 shadow-xl backdrop-blur dark:border-blue-500/40 dark:bg-slate-950/85">
                        <ImagePlus className="mx-auto mb-4 h-12 w-12 text-blue-600 dark:text-blue-300" />
                        <h3 className="text-xl font-black text-slate-950 dark:text-white">Upload ID card images to begin</h3>
                        <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                          The editor will automatically place the front image on top and the back image below with equal spacing.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-5 xl:col-span-2 2xl:col-span-1">
            <div className="glass-card rounded-[2rem] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">Edit Controls</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeCard ? `${SIDE_LABEL[activeCard.side]} selected` : "Select an image on the canvas"}
                  </p>
                </div>
                <MousePointer2 className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>

              {activeCard ? (
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-950/35">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-black">{SIDE_LABEL[activeCard.side]}</p>
                      <QualityPill card={activeCard} />
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Info label="Position" value={`${activeCard.x}, ${activeCard.y}px`} />
                      <Info label="Size" value={`${activeCard.width}×${activeCard.height}px`} />
                      <Info label="Rotation" value={`${activeCard.rotation}°`} />
                      <Info label="Crop" value={activeCard.cropEnabled ? "Fill enabled" : "Fit / no crop"} />
                    </dl>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <ToolbarButton onClick={() => zoomActive(0.96)} title="Zoom selected image out">
                      <ZoomOut className="h-4 w-4" /> Image
                    </ToolbarButton>
                    <ToolbarButton onClick={() => zoomActive(1.04)} title="Zoom selected image in">
                      <ZoomIn className="h-4 w-4" /> Image
                    </ToolbarButton>
                    <ToolbarButton onClick={() => rotateActive(-90)} title="Rotate counter-clockwise">
                      <RotateCcw className="h-4 w-4" /> -90°
                    </ToolbarButton>
                    <ToolbarButton onClick={() => rotateActive(90)} title="Rotate clockwise">
                      <RotateCw className="h-4 w-4" /> +90°
                    </ToolbarButton>
                    <ToolbarButton onClick={toggleCropActive} title="Toggle center crop/fill">
                      <Crop className="h-4 w-4" /> {activeCard.cropEnabled ? "Uncrop" : "Crop Fill"}
                    </ToolbarButton>
                    <ToolbarButton
                      onClick={() => (activeCard.side === "front" ? frontInputRef : backInputRef).current?.click()}
                      title="Replace selected image"
                    >
                      <Replace className="h-4 w-4" /> Replace
                    </ToolbarButton>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-950/35">
                    <p className="mb-3 flex items-center gap-2 text-sm font-black">
                      <Move className="h-4 w-4 text-blue-600" /> Fine position
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <span />
                      <ToolbarButton onClick={() => nudgeActive(0, -5)}>↑</ToolbarButton>
                      <span />
                      <ToolbarButton onClick={() => nudgeActive(-5, 0)}>←</ToolbarButton>
                      <ToolbarButton onClick={autoFitImages} title="Auto-fit both images">
                        <Wand2 className="h-4 w-4" />
                      </ToolbarButton>
                      <ToolbarButton onClick={() => nudgeActive(5, 0)}>→</ToolbarButton>
                      <span />
                      <ToolbarButton onClick={() => nudgeActive(0, 5)}>↓</ToolbarButton>
                      <span />
                    </div>
                  </div>

                  {selectedQuality && selectedQuality.level !== "excellent" && (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                      <p className="font-bold">Quality tip</p>
                      <p className="mt-1 text-xs leading-5">
                        This image is currently estimated at {selectedQuality.dpi} DPI at its printed size. Use a higher resolution upload or reduce its size for sharper glossy photo-paper output.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-white/55 p-6 text-center dark:border-slate-700 dark:bg-slate-950/35">
                  <MousePointer2 className="mx-auto mb-3 h-9 w-9 text-slate-400" />
                  <p className="font-bold">No image selected</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Click an ID image on the canvas to drag, scale, rotate, crop, or replace it.</p>
                </div>
              )}
            </div>

            <div className="glass-card rounded-[2rem] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">Download Options</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Print-ready exports, no editor handles</p>
                </div>
                <Download className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>

              <div className="grid gap-2">
                <ToolbarButton onClick={downloadPNG} disabled={!cards.length} variant="primary" title="Download PNG">
                  <FileImage className="h-4 w-4" /> Download PNG · lossless
                </ToolbarButton>
                <ToolbarButton onClick={downloadJPG} disabled={!cards.length} title="Download JPG">
                  <FileImage className="h-4 w-4" /> Download JPG · quality 100
                </ToolbarButton>
                <ToolbarButton onClick={downloadPDF} disabled={!cards.length} title="Download PDF">
                  <FileText className="h-4 w-4" /> Download PDF · 4×5 in
                </ToolbarButton>
              </div>

              <div className="mt-4 rounded-3xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-950 dark:text-white">PDF / Print layout</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Adjust card size, then apply auto layout before PDF export.</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700 ring-1 ring-blue-200 dark:bg-slate-950/50 dark:text-blue-300 dark:ring-blue-500/25">
                    {layoutScale}%
                  </span>
                </div>
                <input
                  type="range"
                  min="70"
                  max="120"
                  step="1"
                  value={layoutScale}
                  onChange={(event) => setLayoutScale(Number(event.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <ToolbarButton onClick={() => setLayoutScale((value) => Math.max(70, value - 5))}>− Size</ToolbarButton>
                  <ToolbarButton onClick={resetLayout} disabled={!cards.length} variant="primary">
                    Apply
                  </ToolbarButton>
                  <ToolbarButton onClick={() => setLayoutScale((value) => Math.min(120, value + 5))}>+ Size</ToolbarButton>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  The PDF remains exactly 4×5 inches at 600 DPI. This only changes the front/back card size and automatically recalculates equal spacing.
                </p>
              </div>

              <div className="mt-4 rounded-3xl border border-slate-200 bg-white/60 p-4 dark:border-slate-700 dark:bg-slate-950/35">
                <h3 className="mb-3 text-sm font-black">Output specification</h3>
                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <Spec label="Paper size" value="4 × 5 inches" />
                  <Spec label="Resolution" value="2400 × 3000 px" />
                  <Spec label="DPI" value="600 DPI" />
                  <Spec label="Background" value="#FFFFFF white" />
                  <Spec label="Card layout scale" value={`${layoutScale}%`} />
                  <Spec label="Margins" value="0 / no forced printer margin" />
                  <Spec label="Status" value={complete ? "Front + back ready" : "Upload both sides"} />
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>

      <div className="print-only">{printDataUrl && <img src={printDataUrl} alt="Printable 4 by 5 inch ID card sheet" />}</div>

      {previewOpen && previewDataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-slate-950/85 p-4 backdrop-blur-xl">
          <div className="w-full max-w-5xl rounded-[2rem] border border-white/10 bg-white p-4 shadow-2xl dark:bg-slate-950 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">Print Preview Mode</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Exact 4×5 inch layout, white page, 600 DPI ultra-HD export source.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolbarButton onClick={() => setPreviewZoom((value) => Math.max(0.22, value - 0.04))}>
                  <ZoomOut className="h-4 w-4" />
                </ToolbarButton>
                <ToolbarButton onClick={() => setPreviewZoom((value) => Math.min(0.74, value + 0.04))}>
                  <ZoomIn className="h-4 w-4" /> {Math.round(previewZoom * 100)}%
                </ToolbarButton>
                <ToolbarButton onClick={printSheet} variant="primary">
                  <Printer className="h-4 w-4" /> Print
                </ToolbarButton>
                <ToolbarButton onClick={() => setPreviewOpen(false)}>Close</ToolbarButton>
              </div>
            </div>
            <div className="max-h-[75vh] overflow-auto rounded-3xl bg-slate-100 p-6 dark:bg-slate-900">
              <div
                className="mx-auto bg-white shadow-[0_40px_120px_rgba(0,0,0,.35)]"
                style={{ width: CANVAS_WIDTH * previewZoom, height: CANVAS_HEIGHT * previewZoom }}
              >
                <img src={previewDataUrl} alt="Live print preview" className="h-full w-full object-fill" />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Shortcut({ label, keys }: { label: string; keys: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/60 p-2 dark:border-slate-700 dark:bg-slate-950/35">
      <p className="font-bold text-slate-800 dark:text-slate-100">{label}</p>
      <kbd className="mt-1 inline-block rounded-lg bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {keys}
      </kbd>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-2 dark:bg-slate-900/80">
      <dt className="font-bold text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-900/80">
      <span>{label}</span>
      <span className="text-right font-bold text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}
