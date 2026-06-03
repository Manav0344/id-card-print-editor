"use client";

import clsx from "clsx";
import { jsPDF } from "jspdf";
import {
  AlignCenter,
  BadgePlus,
  Camera,
  CheckCircle2,
  Crop,
  Download,
  FileImage,
  FileJson,
  FileText,
  Grid3X3,
  ImagePlus,
  Moon,
  Palette,
  Printer,
  QrCode,
  Redo2,
  RefreshCcw,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Sun,
  Upload,
  Undo2,
  Wand2
} from "lucide-react";
import React, { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type PaperKey = "4x6" | "4x5" | "a4" | "letter" | "custom";
type Orientation = "landscape" | "portrait";
type ImageFit = "cover" | "contain";

type UploadedPhoto = {
  name: string;
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  size: number;
};

type PassportSettings = {
  dpi: 300 | 600;
  paperKey: PaperKey;
  orientation: Orientation;
  customWidthIn: number;
  customHeightIn: number;
  photoWidthMm: number;
  photoHeightMm: number;
  copies: number;
  columns: number;
  rows: number;
  autoSpacing: boolean;
  marginXmm: number;
  marginYmm: number;
  gapXmm: number;
  gapYmm: number;
  backgroundColor: string;
  transparentPng: boolean;
  showCutGuides: boolean;
  showSafeArea: boolean;
  showLabels: boolean;
  labelText: string;
  showWatermark: boolean;
  watermarkText: string;
  watermarkOpacity: number;
  showQr: boolean;
  qrText: string;
  showBarcode: boolean;
  barcodeText: string;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  hue: number;
  sepia: number;
  blur: number;
  cropZoom: number;
  cropX: number;
  cropY: number;
  rotation: number;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  jpgQuality: number;
  pdfCompress: boolean;
  imageFit: ImageFit;
};

const PAPER_PRESETS: Record<Exclude<PaperKey, "custom">, { label: string; widthIn: number; heightIn: number; note: string }> = {
  "4x6": { label: "Glossy 4×6 in / 10×15 cm", widthIn: 4, heightIn: 6, note: "Best for 8 passport photos" },
  "4x5": { label: "4×5 in ID card sheet", widthIn: 4, heightIn: 5, note: "ID card print page" },
  a4: { label: "A4", widthIn: 8.27, heightIn: 11.69, note: "Office/photo printer" },
  letter: { label: "US Letter", widthIn: 8.5, heightIn: 11, note: "Office/photo printer" }
};

const DEFAULT_SETTINGS: PassportSettings = {
  dpi: 600,
  paperKey: "4x6",
  orientation: "landscape",
  customWidthIn: 6,
  customHeightIn: 4,
  photoWidthMm: 35,
  photoHeightMm: 45,
  copies: 8,
  columns: 4,
  rows: 2,
  autoSpacing: true,
  marginXmm: 4,
  marginYmm: 4,
  gapXmm: 3,
  gapYmm: 3,
  backgroundColor: "#ffffff",
  transparentPng: false,
  showCutGuides: true,
  showSafeArea: false,
  showLabels: false,
  labelText: "PASSPORT PHOTO",
  showWatermark: false,
  watermarkText: "SAMPLE",
  watermarkOpacity: 12,
  showQr: false,
  qrText: "Passport photo sheet",
  showBarcode: false,
  barcodeText: "PHOTO-8UP-600DPI",
  brightness: 100,
  contrast: 105,
  saturation: 105,
  grayscale: 0,
  hue: 0,
  sepia: 0,
  blur: 0,
  cropZoom: 1.08,
  cropX: 0,
  cropY: 0,
  rotation: 0,
  borderRadius: 0,
  borderWidth: 1,
  borderColor: "#e2e8f0",
  jpgQuality: 100,
  pdfCompress: false,
  imageFit: "cover"
};

function mmToPx(mm: number, dpi: number) {
  return (mm / 25.4) * dpi;
}

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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
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

function hashText(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function drawQrStyle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, text: string) {
  const cells = 21;
  const cell = size / cells;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = "#0f172a";

  const finder = (fx: number, fy: number) => {
    ctx.fillRect(x + fx * cell, y + fy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + (fx + 1) * cell, y + (fy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(x + (fx + 2) * cell, y + (fy + 2) * cell, 3 * cell, 3 * cell);
  };

  finder(0, 0);
  finder(14, 0);
  finder(0, 14);

  let seed = hashText(text || "passport");
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const inFinder = (col < 7 && row < 7) || (col > 13 && row < 7) || (col < 7 && row > 13);
      if (inFinder) continue;
      seed = Math.imul(seed ^ (row * 31 + col * 17), 1103515245) + 12345;
      if (((seed >>> 16) & 1) === 1) ctx.fillRect(x + col * cell, y + row * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  ctx.restore();
}

function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, text: string) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#0f172a";
  let cursor = x + width * 0.06;
  const maxX = x + width * 0.94;
  const seedBase = hashText(text || "barcode");
  let seed = seedBase;
  while (cursor < maxX) {
    seed = Math.imul(seed ^ 0x45d9f3b, 2654435761);
    const bar = 2 + ((seed >>> 8) % 7);
    const gap = 2 + ((seed >>> 15) % 6);
    ctx.fillRect(cursor, y + height * 0.08, bar, height * 0.68);
    cursor += bar + gap;
  }
  ctx.font = `${Math.max(14, height * 0.12)}px Arial`;
  ctx.textAlign = "center";
  ctx.fillText(text || "PHOTO", x + width / 2, y + height * 0.92);
  ctx.restore();
}

function getPaperSize(settings: PassportSettings) {
  const base =
    settings.paperKey === "custom"
      ? { widthIn: settings.customWidthIn, heightIn: settings.customHeightIn }
      : PAPER_PRESETS[settings.paperKey];

  const short = Math.min(base.widthIn, base.heightIn);
  const long = Math.max(base.widthIn, base.heightIn);
  const widthIn = settings.orientation === "landscape" ? long : short;
  const heightIn = settings.orientation === "landscape" ? short : long;

  return {
    widthIn,
    heightIn,
    pixelWidth: Math.round(widthIn * settings.dpi),
    pixelHeight: Math.round(heightIn * settings.dpi)
  };
}

function getLayout(settings: PassportSettings) {
  const paper = getPaperSize(settings);
  const photoWidth = mmToPx(settings.photoWidthMm, settings.dpi);
  const photoHeight = mmToPx(settings.photoHeightMm, settings.dpi);
  const columns = Math.max(1, settings.columns);
  const rows = Math.max(1, settings.rows);
  const copies = Math.min(settings.copies, columns * rows);

  let gapX = mmToPx(settings.gapXmm, settings.dpi);
  let gapY = mmToPx(settings.gapYmm, settings.dpi);
  let marginX = mmToPx(settings.marginXmm, settings.dpi);
  let marginY = mmToPx(settings.marginYmm, settings.dpi);

  if (settings.autoSpacing) {
    gapX = (paper.pixelWidth - columns * photoWidth) / (columns + 1);
    gapY = (paper.pixelHeight - rows * photoHeight) / (rows + 1);
    marginX = gapX;
    marginY = gapY;
  }

  const fits = gapX >= 0 && gapY >= 0 && marginX >= 0 && marginY >= 0;

  const items = Array.from({ length: copies }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      index,
      x: marginX + col * (photoWidth + gapX),
      y: marginY + row * (photoHeight + gapY),
      width: photoWidth,
      height: photoHeight
    };
  });

  return { paper, photoWidth, photoHeight, gapX, gapY, marginX, marginY, items, fits };
}

function drawSheet(
  ctx: CanvasRenderingContext2D,
  settings: PassportSettings,
  image: HTMLImageElement | null,
  exporting = false
) {
  const { paper, items } = getLayout(settings);
  ctx.clearRect(0, 0, paper.pixelWidth, paper.pixelHeight);

  if (!settings.transparentPng || exporting) {
    ctx.fillStyle = settings.backgroundColor;
    ctx.fillRect(0, 0, paper.pixelWidth, paper.pixelHeight);
  }

  const filter = [
    `brightness(${settings.brightness}%)`,
    `contrast(${settings.contrast}%)`,
    `saturate(${settings.saturation}%)`,
    `grayscale(${settings.grayscale}%)`,
    `hue-rotate(${settings.hue}deg)`,
    `sepia(${settings.sepia}%)`,
    `blur(${settings.blur}px)`
  ].join(" ");

  items.forEach((item) => {
    ctx.save();
    roundRect(ctx, item.x, item.y, item.width, item.height, settings.borderRadius);
    ctx.clip();
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(item.x, item.y, item.width, item.height);

    if (image) {
      ctx.save();
      ctx.filter = filter;
      ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
      ctx.rotate((settings.rotation * Math.PI) / 180);

      const fitScale =
        settings.imageFit === "cover"
          ? Math.max(item.width / image.naturalWidth, item.height / image.naturalHeight)
          : Math.min(item.width / image.naturalWidth, item.height / image.naturalHeight);
      const scale = fitScale * settings.cropZoom;
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const overflowX = Math.max(0, drawWidth - item.width);
      const overflowY = Math.max(0, drawHeight - item.height);
      const offsetX = (settings.cropX / 100) * (overflowX / 2);
      const offsetY = (settings.cropY / 100) * (overflowY / 2);
      ctx.drawImage(image, -drawWidth / 2 + offsetX, -drawHeight / 2 + offsetY, drawWidth, drawHeight);
      ctx.restore();
    } else {
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 4;
      ctx.setLineDash([22, 16]);
      ctx.strokeRect(item.x + 20, item.y + 20, item.width - 40, item.height - 40);
      ctx.setLineDash([]);
      ctx.fillStyle = "#64748b";
      ctx.font = `${Math.max(28, settings.dpi * 0.07)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText("Upload passport photo", item.x + item.width / 2, item.y + item.height / 2);
    }

    ctx.restore();

    if (settings.borderWidth > 0) {
      ctx.strokeStyle = settings.borderColor;
      ctx.lineWidth = settings.borderWidth;
      roundRect(ctx, item.x, item.y, item.width, item.height, settings.borderRadius);
      ctx.stroke();
    }

    if (settings.showSafeArea && !exporting) {
      const safe = Math.min(item.width, item.height) * 0.08;
      ctx.save();
      ctx.strokeStyle = "rgba(16,185,129,.9)";
      ctx.lineWidth = 3;
      ctx.setLineDash([16, 12]);
      ctx.strokeRect(item.x + safe, item.y + safe, item.width - safe * 2, item.height - safe * 2);
      ctx.restore();
    }

    if (settings.showCutGuides) {
      const len = Math.min(54, Math.min(item.width, item.height) * 0.08);
      ctx.save();
      ctx.strokeStyle = "rgba(15,23,42,.45)";
      ctx.lineWidth = Math.max(2, settings.dpi / 220);
      const corners = [
        [item.x, item.y, 1, 1],
        [item.x + item.width, item.y, -1, 1],
        [item.x, item.y + item.height, 1, -1],
        [item.x + item.width, item.y + item.height, -1, -1]
      ];
      corners.forEach(([x, y, sx, sy]) => {
        ctx.beginPath();
        ctx.moveTo(x, y + sy * len);
        ctx.lineTo(x, y);
        ctx.lineTo(x + sx * len, y);
        ctx.stroke();
      });
      ctx.restore();
    }

    if (settings.showLabels) {
      ctx.save();
      ctx.fillStyle = "rgba(15,23,42,.72)";
      ctx.font = `${Math.max(14, settings.dpi * 0.035)}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(settings.labelText, item.x + item.width / 2, item.y + item.height + Math.max(18, settings.dpi * 0.05));
      ctx.restore();
    }
  });

  if (settings.showQr) {
    const size = Math.min(paper.pixelWidth, paper.pixelHeight) * 0.115;
    drawQrStyle(ctx, paper.pixelWidth - size - settings.dpi * 0.12, settings.dpi * 0.12, size, settings.qrText);
  }

  if (settings.showBarcode) {
    drawBarcode(
      ctx,
      settings.dpi * 0.12,
      paper.pixelHeight - settings.dpi * 0.38,
      Math.min(paper.pixelWidth * 0.38, settings.dpi * 2.4),
      settings.dpi * 0.24,
      settings.barcodeText
    );
  }

  if (settings.showWatermark && settings.watermarkText.trim()) {
    ctx.save();
    ctx.globalAlpha = settings.watermarkOpacity / 100;
    ctx.fillStyle = "#0f172a";
    ctx.font = `900 ${Math.max(70, paper.pixelWidth * 0.08)}px Arial`;
    ctx.textAlign = "center";
    ctx.translate(paper.pixelWidth / 2, paper.pixelHeight / 2);
    ctx.rotate(-Math.PI / 7);
    ctx.fillText(settings.watermarkText, 0, 0);
    ctx.restore();
  }
}

function makeDemoPassportPhoto(): UploadedPhoto {
  const width = 900;
  const height = 1200;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#dbeafe");
  bg.addColorStop(1, "#ffffff");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#f1c27d";
  ctx.beginPath();
  ctx.ellipse(width / 2, 420, 160, 190, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1e293b";
  ctx.beginPath();
  ctx.ellipse(width / 2, 330, 180, 120, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(390, 410, 14, 0, Math.PI * 2);
  ctx.arc(510, 410, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7c2d12";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(450, 480, 62, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = "#1d4ed8";
  ctx.beginPath();
  ctx.ellipse(width / 2, 1020, 290, 355, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(345, 760);
  ctx.lineTo(450, 920);
  ctx.lineTo(555, 760);
  ctx.closePath();
  ctx.fill();

  const dataUrl = canvas.toDataURL("image/png");
  return { name: "demo-passport-photo.png", dataUrl, naturalWidth: width, naturalHeight: height, size: Math.round(dataUrl.length * 0.75) };
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function ToolButton({
  children,
  onClick,
  disabled,
  variant = "secondary",
  title
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-black transition-all focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-blue-600 text-white shadow-lg shadow-blue-600/25 hover:-translate-y-0.5 hover:bg-blue-500 focus:ring-blue-500/20",
        variant === "secondary" && "border border-slate-200 bg-white/80 text-slate-700 hover:-translate-y-0.5 hover:border-blue-300 hover:text-blue-700 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200",
        variant === "danger" && "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 focus:ring-rose-500/15 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      )}
    >
      {children}
    </button>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-2xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-950/35">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-black">
        <span>{label}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {value}{suffix}
        </span>
      </div>
      <input className="w-full accent-blue-600" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/40">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
        />
        {suffix && <span className="text-xs font-bold text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

export default function PassportPhotoStudio({ onSwitchToId }: { onSwitchToId?: () => void }) {
  const [settings, setSettings] = useState<PassportSettings>(DEFAULT_SETTINGS);
  const [photo, setPhoto] = useState<UploadedPhoto | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const undoStack = useRef<PassportSettings[]>([]);
  const redoStack = useRef<PassportSettings[]>([]);

  const layout = useMemo(() => getLayout(settings), [settings]);

  const updateSettings = useCallback((patch: Partial<PassportSettings>) => {
    setSettings((previous) => {
      undoStack.current.push(previous);
      if (undoStack.current.length > 80) undoStack.current.shift();
      redoStack.current = [];
      return { ...previous, ...patch };
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!photo) {
      setImage(null);
      return;
    }
    let cancelled = false;
    loadImage(photo.dataUrl).then((loaded) => {
      if (!cancelled) setImage(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [photo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = layout.paper.pixelWidth;
    canvas.height = layout.paper.pixelHeight;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    drawSheet(ctx, settings, image, false);
  }, [settings, image, layout.paper.pixelHeight, layout.paper.pixelWidth]);

  useEffect(() => {
    const autosave = JSON.stringify({ settings, photo });
    localStorage.setItem("passport-photo-studio-autosave", autosave);
  }, [settings, photo]);

  const loadAutosave = useCallback(() => {
    const saved = localStorage.getItem("passport-photo-studio-autosave");
    if (!saved) {
      setMessage("No autosaved passport project found.");
      return;
    }
    try {
      const parsed = JSON.parse(saved) as { settings?: PassportSettings; photo?: UploadedPhoto | null };
      if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      if (parsed.photo) setPhoto(parsed.photo);
      setMessage("Autosaved passport project loaded.");
    } catch {
      setMessage("Autosave file could not be loaded.");
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!/image\/(png|jpe?g)/i.test(file.type)) {
      setMessage("Please upload a JPG, JPEG, or PNG passport photo.");
      return;
    }
    const dataUrl = await readFileAsDataURL(file);
    const loaded = await loadImage(dataUrl);
    setPhoto({ name: file.name, dataUrl, naturalWidth: loaded.naturalWidth, naturalHeight: loaded.naturalHeight, size: file.size });
    setImage(loaded);
    setMessage("Passport photo uploaded. The sheet now creates 8 equal-size photos on glossy 4×6 paper.");
  }, []);

  const exportDataUrl = useCallback(
    (type: "image/png" | "image/jpeg") => {
      const source = canvasRef.current;
      if (!source) return null;
      const offscreen = document.createElement("canvas");
      offscreen.width = layout.paper.pixelWidth;
      offscreen.height = layout.paper.pixelHeight;
      const ctx = offscreen.getContext("2d", { alpha: type === "image/png" && settings.transparentPng });
      if (!ctx) return null;
      drawSheet(ctx, settings, image, true);
      return offscreen.toDataURL(type, type === "image/jpeg" ? settings.jpgQuality / 100 : undefined);
    },
    [image, layout.paper.pixelHeight, layout.paper.pixelWidth, settings]
  );

  const downloadPNG = useCallback(() => {
    const dataUrl = exportDataUrl("image/png");
    if (!dataUrl) return;
    downloadDataUrl(dataUrl, `passport-8-photos-${settings.dpi}dpi.png`);
    setMessage(`Downloaded PNG: ${layout.paper.pixelWidth}×${layout.paper.pixelHeight}px at ${settings.dpi} DPI.`);
  }, [exportDataUrl, layout.paper.pixelHeight, layout.paper.pixelWidth, settings.dpi]);

  const downloadJPG = useCallback(() => {
    const dataUrl = exportDataUrl("image/jpeg");
    if (!dataUrl) return;
    downloadDataUrl(dataUrl, `passport-8-photos-${settings.dpi}dpi.jpg`);
    setMessage(`Downloaded JPG at ${settings.jpgQuality}% quality.`);
  }, [exportDataUrl, settings.dpi, settings.jpgQuality]);

  const downloadPDF = useCallback(() => {
    const dataUrl = exportDataUrl("image/png");
    if (!dataUrl) return;
    const { widthIn, heightIn } = layout.paper;
    const pdf = new jsPDF({
      orientation: widthIn > heightIn ? "landscape" : "portrait",
      unit: "in",
      format: [widthIn, heightIn],
      compress: settings.pdfCompress,
      precision: 16
    });
    pdf.setProperties({
      title: `Passport Photo Sheet ${settings.dpi} DPI`,
      subject: "8 passport size photos on glossy paper",
      creator: "Professional ID Card Print Editor",
      keywords: "passport photo, 4x6, glossy paper, 600 dpi, 8 photos"
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, widthIn, heightIn, undefined, settings.pdfCompress ? "FAST" : "NONE");
    pdf.save(`passport-8-photos-${settings.dpi}dpi.pdf`);
    setMessage("Downloaded exact-size PDF for glossy paper printing.");
  }, [exportDataUrl, layout.paper, settings.dpi, settings.pdfCompress]);

  const printSheet = useCallback(() => {
    const dataUrl = exportDataUrl("image/png");
    if (!dataUrl) return;
    const { widthIn, heightIn } = layout.paper;
    const win = window.open("", "_blank");
    if (!win) {
      setMessage("Popup blocked. Please allow popups or download PDF instead.");
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Print Passport Photos</title><style>@page{size:${widthIn}in ${heightIn}in;margin:0}html,body{margin:0;width:${widthIn}in;height:${heightIn}in;background:white}img{display:block;width:${widthIn}in;height:${heightIn}in}</style></head><body><img src="${dataUrl}" onload="setTimeout(()=>print(),250)" /></body></html>`);
    win.document.close();
  }, [exportDataUrl, layout.paper]);

  const saveProject = useCallback(() => {
    const blob = new Blob([JSON.stringify({ settings, photo }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, "passport-photo-project.json");
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [photo, settings]);

  const loadProject = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { settings?: PassportSettings; photo?: UploadedPhoto | null };
      if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      if (parsed.photo) setPhoto(parsed.photo);
      setMessage("Project JSON loaded successfully.");
    } catch {
      setMessage("Could not read this project JSON file.");
    }
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(settings);
    setSettings(previous);
  }, [settings]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(settings);
    setSettings(next);
  }, [settings]);

  const loadDemo = useCallback(() => {
    const demo = makeDemoPassportPhoto();
    setPhoto(demo);
    loadImage(demo.dataUrl).then(setImage);
    setSettings(DEFAULT_SETTINGS);
    setMessage("Demo passport photo loaded: 8 photos on 4×6 glossy paper at 600 DPI.");
  }, []);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const qualityDpi = photo
    ? Math.floor(
        Math.min(
          photo.naturalWidth / (layout.photoWidth / settings.dpi),
          photo.naturalHeight / (layout.photoHeight / settings.dpi)
        )
      )
    : 0;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0,transparent_38%),radial-gradient(circle_at_top_right,#ede9fe_0,transparent_34%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-3 py-4 text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.22)_0,transparent_32%),radial-gradient(circle_at_top_right,rgba(168,85,247,.18)_0,transparent_32%),linear-gradient(180deg,#020617,#0f172a)] dark:text-white sm:px-5 lg:px-8">
      {message && (
        <div className="fixed right-4 top-4 z-50 max-w-md rounded-2xl border border-blue-200 bg-white/95 p-4 text-sm font-bold text-slate-800 shadow-glow backdrop-blur-xl dark:border-blue-500/30 dark:bg-slate-950/95 dark:text-slate-100">
          {message}
        </div>
      )}

      <div className="mx-auto max-w-[1800px]">
        <header className="glass-card mb-4 rounded-[2rem] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                <Camera className="h-3.5 w-3.5" /> Passport Photo Studio · 8-Up · 600 DPI
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-4xl">Passport Size Photo Maker</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Upload one passport photo and automatically create 8 equal-size photos on glossy 4×6 / 10×15 cm paper. Includes crop, brightness, contrast, color correction, guides, text, QR/barcode marks, save/load, and print-ready exports.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onSwitchToId && (
                <ToolButton onClick={onSwitchToId}>
                  <BadgePlus className="h-4 w-4" /> ID Card Editor
                </ToolButton>
              )}
              <ToolButton onClick={loadDemo}>
                <Wand2 className="h-4 w-4" /> Load Demo
              </ToolButton>
              <ToolButton onClick={() => setDarkMode((value) => !value)}>
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {darkMode ? "Light" : "Dark"}
              </ToolButton>
              <ToolButton onClick={printSheet} disabled={!photo} variant="primary">
                <Printer className="h-4 w-4" /> Print
              </ToolButton>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[390px_minmax(0,1fr)_390px]">
          <aside className="space-y-4">
            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-black">
                <Upload className="h-5 w-5 text-blue-600" /> Upload Passport Photo
              </h2>
              <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Upload 1 photo. The editor repeats it 8 times automatically.</p>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={(event) => event.target.files?.[0] && handleFile(event.target.files[0])} />
              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
                className="rounded-3xl border border-dashed border-blue-300 bg-blue-50/60 p-4 text-center dark:border-blue-500/30 dark:bg-blue-500/10"
              >
                <div className="mx-auto mb-3 flex h-32 w-28 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  {photo ? <img src={photo.dataUrl} alt="Passport preview" className="h-full w-full object-cover" /> : <ImagePlus className="h-9 w-9 text-blue-600" />}
                </div>
                <ToolButton onClick={() => fileInputRef.current?.click()} variant="primary">
                  <Upload className="h-4 w-4" /> {photo ? "Replace Photo" : "Upload Photo"}
                </ToolButton>
                {photo && (
                  <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                    <p className="truncate font-black">{photo.name}</p>
                    <p>{photo.naturalWidth}×{photo.naturalHeight}px · {bytesToSize(photo.size)}</p>
                    <p className={clsx("mt-2 inline-flex rounded-full px-2.5 py-1 font-black ring-1", qualityDpi >= 600 ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30" : qualityDpi >= 300 ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30" : "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30")}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {qualityDpi} effective DPI
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black">
                <Settings2 className="h-5 w-5 text-blue-600" /> Paper & Size Presets
              </h2>
              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-black text-slate-500 dark:text-slate-400">Paper preset</span>
                  <select className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-950/50" value={settings.paperKey} onChange={(event) => updateSettings({ paperKey: event.target.value as PaperKey })}>
                    {Object.entries(PAPER_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.label}</option>
                    ))}
                    <option value="custom">Custom size</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35">
                    <input type="radio" checked={settings.orientation === "landscape"} onChange={() => updateSettings({ orientation: "landscape" })} /> Landscape
                  </label>
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35">
                    <input type="radio" checked={settings.orientation === "portrait"} onChange={() => updateSettings({ orientation: "portrait" })} /> Portrait
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Photo width" value={settings.photoWidthMm} min={20} max={70} step={0.5} suffix="mm" onChange={(value) => updateSettings({ photoWidthMm: value })} />
                  <NumberField label="Photo height" value={settings.photoHeightMm} min={20} max={80} step={0.5} suffix="mm" onChange={(value) => updateSettings({ photoHeightMm: value })} />
                  <NumberField label="Columns" value={settings.columns} min={1} max={8} onChange={(value) => updateSettings({ columns: value })} />
                  <NumberField label="Rows" value={settings.rows} min={1} max={8} onChange={(value) => updateSettings({ rows: value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ToolButton onClick={() => updateSettings({ dpi: settings.dpi === 600 ? 300 : 600 })}>
                    {settings.dpi} DPI
                  </ToolButton>
                  <ToolButton onClick={() => updateSettings({ columns: 4, rows: 2, copies: 8, photoWidthMm: 35, photoHeightMm: 45, paperKey: "4x6", orientation: "landscape", autoSpacing: true })} variant="primary">
                    8 Photos Fit
                  </ToolButton>
                </div>
              </div>
            </div>
          </aside>

          <section className="glass-card min-w-0 overflow-hidden rounded-[2rem]">
            <div className="flex flex-col gap-3 border-b border-white/60 p-4 dark:border-slate-700/50 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black">Live Glossy Paper Preview</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {layout.paper.widthIn.toFixed(2)}×{layout.paper.heightIn.toFixed(2)} in · {layout.paper.pixelWidth}×{layout.paper.pixelHeight}px · {settings.dpi} DPI · {settings.copies} copies
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolButton onClick={undo} disabled={!undoStack.current.length}><Undo2 className="h-4 w-4" /> Undo</ToolButton>
                <ToolButton onClick={redo} disabled={!redoStack.current.length}><Redo2 className="h-4 w-4" /> Redo</ToolButton>
                <ToolButton onClick={() => updateSettings(DEFAULT_SETTINGS)}><RefreshCcw className="h-4 w-4" /> Reset</ToolButton>
              </div>
            </div>
            <div className="fine-grid overflow-x-hidden p-3 sm:p-5">
              <div className="mx-auto max-w-full rounded-[1.5rem] bg-slate-900/10 p-2 shadow-2xl dark:bg-black/35 sm:p-4">
                <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[72vh] w-auto max-w-full bg-white shadow-[0_25px_80px_rgba(15,23,42,.22)]" />
              </div>
              {!layout.fits && (
                <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  The selected passport photo size does not fit comfortably. Use 4×6 landscape with 35×45 mm, reduce columns/rows, or enable auto spacing.
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4 xl:col-span-2 2xl:col-span-1">
            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><SlidersHorizontal className="h-5 w-5 text-blue-600" /> Photo Enhancement</h2>
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                <RangeControl label="Brightness" value={settings.brightness} min={50} max={160} suffix="%" onChange={(value) => updateSettings({ brightness: value })} />
                <RangeControl label="Contrast" value={settings.contrast} min={50} max={180} suffix="%" onChange={(value) => updateSettings({ contrast: value })} />
                <RangeControl label="Color / Saturation" value={settings.saturation} min={0} max={220} suffix="%" onChange={(value) => updateSettings({ saturation: value })} />
                <RangeControl label="Hue" value={settings.hue} min={-180} max={180} suffix="°" onChange={(value) => updateSettings({ hue: value })} />
                <RangeControl label="Grayscale" value={settings.grayscale} min={0} max={100} suffix="%" onChange={(value) => updateSettings({ grayscale: value })} />
                <RangeControl label="Sepia / Warmth" value={settings.sepia} min={0} max={80} suffix="%" onChange={(value) => updateSettings({ sepia: value })} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ToolButton onClick={() => setCropOpen(true)}><Crop className="h-4 w-4" /> Crop Editor</ToolButton>
                <ToolButton onClick={() => updateSettings({ brightness: 100, contrast: 105, saturation: 105, grayscale: 0, hue: 0, sepia: 0, blur: 0 })}><Wand2 className="h-4 w-4" /> Auto Color</ToolButton>
                <ToolButton onClick={() => updateSettings({ rotation: settings.rotation - 90 })}><RotateCcw className="h-4 w-4" /> Rotate</ToolButton>
                <ToolButton onClick={() => updateSettings({ rotation: settings.rotation + 90 })}><RotateCw className="h-4 w-4" /> Rotate</ToolButton>
              </div>
            </div>

            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Grid3X3 className="h-5 w-5 text-blue-600" /> Layout, Guides & Layers</h2>
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.autoSpacing} onChange={(event) => updateSettings({ autoSpacing: event.target.checked })} /> Auto spacing</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showCutGuides} onChange={(event) => updateSettings({ showCutGuides: event.target.checked })} /> Cut guides</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showSafeArea} onChange={(event) => updateSettings({ showSafeArea: event.target.checked })} /> Safe area guides</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showLabels} onChange={(event) => updateSettings({ showLabels: event.target.checked })} /> Text labels</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showWatermark} onChange={(event) => updateSettings({ showWatermark: event.target.checked })} /> Watermark</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showQr} onChange={(event) => updateSettings({ showQr: event.target.checked })} /> QR mark</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showBarcode} onChange={(event) => updateSettings({ showBarcode: event.target.checked })} /> Barcode mark</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.transparentPng} onChange={(event) => updateSettings({ transparentPng: event.target.checked })} /> Transparent PNG</label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <NumberField label="Manual margin X" value={settings.marginXmm} min={0} max={30} step={0.5} suffix="mm" onChange={(value) => updateSettings({ marginXmm: value, autoSpacing: false })} />
                <NumberField label="Manual margin Y" value={settings.marginYmm} min={0} max={30} step={0.5} suffix="mm" onChange={(value) => updateSettings({ marginYmm: value, autoSpacing: false })} />
                <NumberField label="Manual gap X" value={settings.gapXmm} min={0} max={30} step={0.5} suffix="mm" onChange={(value) => updateSettings({ gapXmm: value, autoSpacing: false })} />
                <NumberField label="Manual gap Y" value={settings.gapYmm} min={0} max={30} step={0.5} suffix="mm" onChange={(value) => updateSettings({ gapYmm: value, autoSpacing: false })} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">Background</span><input type="color" className="h-11 w-full rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950" value={settings.backgroundColor} onChange={(event) => updateSettings({ backgroundColor: event.target.value })} /></label>
                <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">Border color</span><input type="color" className="h-11 w-full rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950" value={settings.borderColor} onChange={(event) => updateSettings({ borderColor: event.target.value })} /></label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <ToolButton onClick={() => updateSettings({ autoSpacing: true })}><AlignCenter className="h-4 w-4" /> Center / Equal Gap</ToolButton>
                <ToolButton onClick={() => updateSettings({ showCutGuides: true, showSafeArea: true })}><Scissors className="h-4 w-4" /> Guides On</ToolButton>
              </div>
            </div>

            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Download className="h-5 w-5 text-blue-600" /> Save, Load & Export</h2>
              <input ref={projectInputRef} type="file" accept="application/json" className="hidden" onChange={loadProject} />
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                <ToolButton onClick={downloadPNG} disabled={!photo} variant="primary"><FileImage className="h-4 w-4" /> Download PNG</ToolButton>
                <ToolButton onClick={downloadJPG} disabled={!photo}><FileImage className="h-4 w-4" /> Download JPG</ToolButton>
                <ToolButton onClick={downloadPDF} disabled={!photo}><FileText className="h-4 w-4" /> Download PDF</ToolButton>
                <ToolButton onClick={saveProject}><Save className="h-4 w-4" /> Save Project</ToolButton>
                <ToolButton onClick={() => projectInputRef.current?.click()}><FileJson className="h-4 w-4" /> Load Project</ToolButton>
                <ToolButton onClick={loadAutosave}><RefreshCcw className="h-4 w-4" /> Load Autosave</ToolButton>
              </div>
              <div className="mt-3 rounded-3xl border border-slate-200 bg-white/60 p-4 text-xs dark:border-slate-700 dark:bg-slate-950/35">
                <Spec label="Paper" value={`${layout.paper.widthIn.toFixed(2)}×${layout.paper.heightIn.toFixed(2)} in`} />
                <Spec label="Pixels" value={`${layout.paper.pixelWidth}×${layout.paper.pixelHeight}`} />
                <Spec label="Photo size" value={`${settings.photoWidthMm}×${settings.photoHeightMm} mm`} />
                <Spec label="Layout" value={`${settings.columns}×${settings.rows}, ${settings.copies} copies`} />
                <Spec label="DPI" value={`${settings.dpi} DPI`} />
              </div>
            </div>
          </aside>
        </section>
      </div>

      {cropOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-slate-950/85 p-4 backdrop-blur-xl">
          <div className="w-full max-w-3xl rounded-[2rem] border border-white/10 bg-white p-5 shadow-2xl dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Crop Editor</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Move the face/photo inside every passport frame. Changes apply to all 8 photos.</p>
              </div>
              <ToolButton onClick={() => setCropOpen(false)}>Done</ToolButton>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <RangeControl label="Crop zoom" value={Number(settings.cropZoom.toFixed(2))} min={0.6} max={2.5} step={0.01} suffix="×" onChange={(value) => updateSettings({ cropZoom: value })} />
              <RangeControl label="Move X" value={settings.cropX} min={-100} max={100} suffix="" onChange={(value) => updateSettings({ cropX: value })} />
              <RangeControl label="Move Y" value={settings.cropY} min={-100} max={100} suffix="" onChange={(value) => updateSettings({ cropY: value })} />
              <RangeControl label="Rotation" value={settings.rotation} min={-30} max={30} suffix="°" onChange={(value) => updateSettings({ rotation: value })} />
              <RangeControl label="Corner radius" value={settings.borderRadius} min={0} max={80} suffix="px" onChange={(value) => updateSettings({ borderRadius: value })} />
              <RangeControl label="Border width" value={settings.borderWidth} min={0} max={12} suffix="px" onChange={(value) => updateSettings({ borderWidth: value })} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ToolButton onClick={() => updateSettings({ imageFit: settings.imageFit === "cover" ? "contain" : "cover" })}><Crop className="h-4 w-4" /> Fit: {settings.imageFit}</ToolButton>
              <ToolButton onClick={() => updateSettings({ cropZoom: 1.08, cropX: 0, cropY: 0, rotation: 0 })}><RefreshCcw className="h-4 w-4" /> Reset Crop</ToolButton>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 dark:bg-slate-900/80">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-black text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}
