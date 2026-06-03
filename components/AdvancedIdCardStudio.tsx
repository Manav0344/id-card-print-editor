"use client";

import clsx from "clsx";
import { jsPDF } from "jspdf";
import {
  AlignCenter,
  BadgePlus,
  Crop,
  Download,
  FileImage,
  FileJson,
  FileText,
  Grid3X3,
  ImagePlus,
  Layers3,
  Moon,
  Palette,
  Printer,
  QrCode,
  Redo2,
  RefreshCcw,
  RotateCcw,
  Save,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Type,
  Undo2,
  Upload,
  Wand2
} from "lucide-react";
import React, { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type PaperKey = "4x5" | "4x6" | "a4" | "letter" | "custom";
type Orientation = "portrait" | "landscape";
type Align = "left" | "center" | "right";
type BackgroundMode = "white" | "custom" | "gradient" | "transparent";
type Side = "front" | "back";

type UploadedImage = {
  name: string;
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  size: number;
};

type CropState = {
  zoom: number;
  x: number;
  y: number;
  rotation: number;
};

type TextLayers = {
  name: string;
  idNumber: string;
  company: string;
  date: string;
  custom: string;
};

type AdvancedIdSettings = {
  dpi: 300 | 600;
  paperKey: PaperKey;
  orientation: Orientation;
  customWidthIn: number;
  customHeightIn: number;
  pairCount: 1 | 2 | 4;
  cardWidthMm: number;
  cardHeightMm: number;
  topMarginMm: number;
  sideMarginMm: number;
  pairGapMm: number;
  frontBackGapMm: number;
  align: Align;
  autoEqualGap: boolean;
  snapToGuides: boolean;
  showPrintBoundary: boolean;
  showCutLine: boolean;
  showSafeMargin: boolean;
  safeMarginMm: number;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  gradientFrom: string;
  gradientTo: string;
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
  sharpen: number;
  pngTransparent: boolean;
  jpgQuality: number;
  pdfCompress: boolean;
  showTextLayer: boolean;
  text: TextLayers;
  textColor: string;
  showQr: boolean;
  qrText: string;
  showBarcode: boolean;
  barcodeText: string;
  showWatermark: boolean;
  watermarkText: string;
  watermarkOpacity: number;
  frontCrop: CropState;
  backCrop: CropState;
};

const PAPER_PRESETS: Record<Exclude<PaperKey, "custom">, { label: string; widthIn: number; heightIn: number }> = {
  "4x5": { label: "4×5 inch", widthIn: 4, heightIn: 5 },
  "4x6": { label: "4×6 inch / 10×15 cm glossy", widthIn: 4, heightIn: 6 },
  a4: { label: "A4", widthIn: 8.27, heightIn: 11.69 },
  letter: { label: "Letter", widthIn: 8.5, heightIn: 11 }
};

const DEFAULT_SETTINGS: AdvancedIdSettings = {
  dpi: 600,
  paperKey: "4x5",
  orientation: "portrait",
  customWidthIn: 4,
  customHeightIn: 5,
  pairCount: 1,
  cardWidthMm: 86,
  cardHeightMm: 54,
  topMarginMm: 8,
  sideMarginMm: 6,
  pairGapMm: 6,
  frontBackGapMm: 5,
  align: "center",
  autoEqualGap: true,
  snapToGuides: true,
  showPrintBoundary: true,
  showCutLine: true,
  showSafeMargin: false,
  safeMarginMm: 3,
  backgroundMode: "white",
  backgroundColor: "#ffffff",
  gradientFrom: "#ffffff",
  gradientTo: "#eff6ff",
  brightness: 100,
  contrast: 105,
  saturation: 105,
  grayscale: 0,
  sharpen: 0,
  pngTransparent: false,
  jpgQuality: 100,
  pdfCompress: false,
  showTextLayer: false,
  text: {
    name: "Aarav Sharma",
    idNumber: "ID-2026-0148",
    company: "ACME Corporation",
    date: "Valid: 2028",
    custom: "AUTHORIZED COPY"
  },
  textColor: "#0f172a",
  showQr: false,
  qrText: "https://example.com/verify/ID-2026-0148",
  showBarcode: false,
  barcodeText: "ID-2026-0148",
  showWatermark: false,
  watermarkText: "SAMPLE",
  watermarkOpacity: 12,
  frontCrop: { zoom: 1, x: 0, y: 0, rotation: 0 },
  backCrop: { zoom: 1, x: 0, y: 0, rotation: 0 }
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
  let seed = hashText(text || "qr");
  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      const fixed = (col < 7 && row < 7) || (col > 13 && row < 7) || (col < 7 && row > 13);
      if (fixed) continue;
      seed = Math.imul(seed ^ (row * 29 + col * 37), 1103515245) + 12345;
      if (((seed >>> 16) & 1) === 1) ctx.fillRect(x + col * cell, y + row * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  ctx.restore();
}

function drawBarcode(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, text: string) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,.92)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "#0f172a";
  let cursor = x + width * 0.06;
  const maxX = x + width * 0.94;
  let seed = hashText(text || "barcode");
  while (cursor < maxX) {
    seed = Math.imul(seed ^ 0x45d9f3b, 2654435761);
    const bar = 2 + ((seed >>> 8) % 7);
    const gap = 2 + ((seed >>> 15) % 6);
    ctx.fillRect(cursor, y + height * 0.08, bar, height * 0.62);
    cursor += bar + gap;
  }
  ctx.font = `${Math.max(10, height * 0.16)}px Arial`;
  ctx.textAlign = "center";
  ctx.fillText(text || "ID", x + width / 2, y + height * 0.92);
  ctx.restore();
}

function getPaperSize(settings: AdvancedIdSettings) {
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

function getPairGrid(pairCount: 1 | 2 | 4) {
  if (pairCount === 1) return { columns: 1, rows: 1 };
  if (pairCount === 2) return { columns: 2, rows: 1 };
  return { columns: 2, rows: 2 };
}

function getLayout(settings: AdvancedIdSettings) {
  const paper = getPaperSize(settings);
  const cardWidth = mmToPx(settings.cardWidthMm, settings.dpi);
  const cardHeight = mmToPx(settings.cardHeightMm, settings.dpi);
  const { columns, rows } = getPairGrid(settings.pairCount);
  const frontBackGap = mmToPx(settings.frontBackGapMm, settings.dpi);
  const pairGap = mmToPx(settings.pairGapMm, settings.dpi);
  const sideMargin = mmToPx(settings.sideMarginMm, settings.dpi);
  const topMargin = mmToPx(settings.topMarginMm, settings.dpi);
  const pairBlockWidth = cardWidth;
  const pairBlockHeight = cardHeight * 2 + frontBackGap;
  const totalGridWidth = columns * pairBlockWidth + (columns - 1) * pairGap;
  const totalGridHeight = rows * pairBlockHeight + (rows - 1) * pairGap;
  const autoGapX = columns > 1 ? Math.max(0, (paper.pixelWidth - columns * pairBlockWidth) / (columns + 1)) : 0;
  const autoGapY = rows > 1 ? Math.max(0, (paper.pixelHeight - rows * pairBlockHeight) / (rows + 1)) : 0;

  const startY = settings.autoEqualGap ? Math.max(0, autoGapY) : topMargin;
  let startX = sideMargin;
  if (settings.autoEqualGap) startX = columns > 1 ? autoGapX : (paper.pixelWidth - pairBlockWidth) / 2;
  else if (settings.align === "center") startX = (paper.pixelWidth - totalGridWidth) / 2;
  else if (settings.align === "right") startX = paper.pixelWidth - totalGridWidth - sideMargin;

  const realPairGapX = settings.autoEqualGap && columns > 1 ? autoGapX : pairGap;
  const realPairGapY = settings.autoEqualGap && rows > 1 ? autoGapY : pairGap;

  const pairs = Array.from({ length: settings.pairCount }, (_, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + col * (pairBlockWidth + realPairGapX);
    const y = startY + row * (pairBlockHeight + realPairGapY);
    return {
      index,
      x,
      y,
      front: { x, y, width: cardWidth, height: cardHeight },
      back: { x, y: y + cardHeight + frontBackGap, width: cardWidth, height: cardHeight }
    };
  });

  const fits =
    totalGridWidth <= paper.pixelWidth - sideMargin * 2 + 1 &&
    totalGridHeight <= paper.pixelHeight - topMargin * 2 + 1 &&
    pairs.every((pair) => pair.front.x >= -1 && pair.front.y >= -1 && pair.back.x + cardWidth <= paper.pixelWidth + 1 && pair.back.y + cardHeight <= paper.pixelHeight + 1);

  return { paper, cardWidth, cardHeight, pairs, fits, totalGridWidth, totalGridHeight };
}

function makeDemoImage(side: Side): UploadedImage {
  const width = 1600;
  const height = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, side === "front" ? "#1d4ed8" : "#0f172a");
  gradient.addColorStop(1, side === "front" ? "#06b6d4" : "#475569");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  for (let i = -200; i < width; i += 240) {
    ctx.beginPath();
    ctx.ellipse(i + 150, 150, 250, 70, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (side === "front") {
    ctx.fillStyle = "rgba(255,255,255,.95)";
    roundRect(ctx, 90, 120, 420, 620, 46);
    ctx.fill();
    ctx.fillStyle = "#dbeafe";
    roundRect(ctx, 130, 165, 340, 430, 34);
    ctx.fill();
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.arc(300, 310, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#bfdbfe";
    ctx.beginPath();
    ctx.arc(300, 280, 54, 0, Math.PI * 2);
    ctx.fill();
    roundRect(ctx, 195, 390, 210, 150, 76);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 70px Arial";
    ctx.fillText("ACME CORPORATION", 610, 185);
    ctx.font = "700 40px Arial";
    ctx.fillText("EMPLOYEE ID CARD", 615, 245);
    ctx.fillStyle = "rgba(255,255,255,.9)";
    roundRect(ctx, 610, 315, 810, 430, 50);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = "900 72px Arial";
    ctx.fillText("AARAV SHARMA", 670, 420);
    ctx.font = "700 40px Arial";
    ctx.fillStyle = "#2563eb";
    ctx.fillText("Senior Manager", 675, 500);
    ctx.fillStyle = "#334155";
    ctx.font = "700 34px Arial";
    ctx.fillText("ID: ACME-2026-0148", 675, 585);
    ctx.fillText("Dept: Administration", 675, 650);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 70px Arial";
    ctx.fillText("ACME CORPORATION", 100, 170);
    ctx.font = "700 36px Arial";
    ctx.fillText("BACK SIDE · EMERGENCY / BARCODE", 105, 230);
    ctx.fillStyle = "rgba(255,255,255,.92)";
    roundRect(ctx, 100, 305, 1390, 330, 50);
    ctx.fill();
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 42px Arial";
    ctx.fillText("If found, please return this card to ACME Corporation.", 170, 410);
    ctx.fillText("Emergency: +91 98765 43210", 170, 500);
    drawBarcode(ctx, 170, 700, 900, 150, "ACME-2026-0148");
  }
  const dataUrl = canvas.toDataURL("image/png");
  return { name: `${side}-demo-id.png`, dataUrl, naturalWidth: width, naturalHeight: height, size: Math.round(dataUrl.length * 0.75) };
}

function applySharpen(imageData: ImageData, amount: number) {
  if (amount <= 0) return imageData;
  const factor = amount / 100;
  const { width, height, data } = imageData;
  const output = new Uint8ClampedArray(data);
  const center = 1 + 4 * factor;
  const side = -factor;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        const value =
          data[idx + c] * center +
          data[idx - 4 + c] * side +
          data[idx + 4 + c] * side +
          data[idx - width * 4 + c] * side +
          data[idx + width * 4 + c] * side;
        output[idx + c] = Math.max(0, Math.min(255, value));
      }
    }
  }
  return new ImageData(output, width, height);
}

function drawImageIntoCard(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  rect: { x: number; y: number; width: number; height: number },
  crop: CropState,
  settings: AdvancedIdSettings
) {
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 18);
  ctx.clip();
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (!image) {
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = Math.max(3, settings.dpi / 170);
    ctx.setLineDash([22, 16]);
    ctx.strokeRect(rect.x + 24, rect.y + 24, rect.width - 48, rect.height - 48);
    ctx.setLineDash([]);
    ctx.fillStyle = "#64748b";
    ctx.font = `900 ${Math.max(28, settings.dpi * 0.055)}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("Upload ID Image", rect.x + rect.width / 2, rect.y + rect.height / 2);
    ctx.restore();
    return;
  }

  const filter = [
    `brightness(${settings.brightness}%)`,
    `contrast(${settings.contrast}%)`,
    `saturate(${settings.saturation}%)`,
    `grayscale(${settings.grayscale}%)`
  ].join(" ");

  const temp = document.createElement("canvas");
  temp.width = Math.max(1, Math.round(rect.width));
  temp.height = Math.max(1, Math.round(rect.height));
  const tctx = temp.getContext("2d");
  if (tctx) {
    tctx.filter = filter;
    tctx.translate(temp.width / 2, temp.height / 2);
    tctx.rotate((crop.rotation * Math.PI) / 180);
    const baseScale = Math.max(temp.width / image.naturalWidth, temp.height / image.naturalHeight) * crop.zoom;
    const drawWidth = image.naturalWidth * baseScale;
    const drawHeight = image.naturalHeight * baseScale;
    const overflowX = Math.max(0, drawWidth - temp.width);
    const overflowY = Math.max(0, drawHeight - temp.height);
    tctx.drawImage(image, -drawWidth / 2 + (crop.x / 100) * (overflowX / 2), -drawHeight / 2 + (crop.y / 100) * (overflowY / 2), drawWidth, drawHeight);
    if (settings.sharpen > 0) {
      const imageData = tctx.getImageData(0, 0, temp.width, temp.height);
      tctx.putImageData(applySharpen(imageData, settings.sharpen), 0, 0);
    }
    ctx.drawImage(temp, rect.x, rect.y, rect.width, rect.height);
  }
  ctx.restore();
}

function drawSheet(
  ctx: CanvasRenderingContext2D,
  settings: AdvancedIdSettings,
  frontImage: HTMLImageElement | null,
  backImage: HTMLImageElement | null,
  exporting: boolean
) {
  const layout = getLayout(settings);
  const { paper } = layout;
  ctx.clearRect(0, 0, paper.pixelWidth, paper.pixelHeight);

  if (settings.backgroundMode === "transparent" && !exporting && settings.pngTransparent) {
    // leave transparent
  } else if (settings.backgroundMode === "gradient") {
    const gradient = ctx.createLinearGradient(0, 0, paper.pixelWidth, paper.pixelHeight);
    gradient.addColorStop(0, settings.gradientFrom);
    gradient.addColorStop(1, settings.gradientTo);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, paper.pixelWidth, paper.pixelHeight);
  } else {
    ctx.fillStyle = settings.backgroundMode === "custom" ? settings.backgroundColor : "#ffffff";
    ctx.fillRect(0, 0, paper.pixelWidth, paper.pixelHeight);
  }

  if (settings.showPrintBoundary) {
    ctx.save();
    ctx.strokeStyle = exporting ? "rgba(15,23,42,.28)" : "rgba(37,99,235,.75)";
    ctx.lineWidth = Math.max(2, settings.dpi / 180);
    ctx.setLineDash(exporting ? [] : [18, 14]);
    ctx.strokeRect(4, 4, paper.pixelWidth - 8, paper.pixelHeight - 8);
    ctx.restore();
  }

  layout.pairs.forEach((pair) => {
    drawImageIntoCard(ctx, frontImage, pair.front, settings.frontCrop, settings);
    drawImageIntoCard(ctx, backImage, pair.back, settings.backCrop, settings);

    [pair.front, pair.back].forEach((rect) => {
      if (settings.showCutLine) {
        const len = Math.min(rect.width, rect.height) * 0.08;
        ctx.save();
        ctx.strokeStyle = "rgba(15,23,42,.5)";
        ctx.lineWidth = Math.max(2, settings.dpi / 220);
        const corners = [
          [rect.x, rect.y, 1, 1],
          [rect.x + rect.width, rect.y, -1, 1],
          [rect.x, rect.y + rect.height, 1, -1],
          [rect.x + rect.width, rect.y + rect.height, -1, -1]
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
      if (settings.showSafeMargin) {
        const safe = mmToPx(settings.safeMarginMm, settings.dpi);
        ctx.save();
        ctx.strokeStyle = exporting ? "rgba(16,185,129,.45)" : "rgba(16,185,129,.95)";
        ctx.lineWidth = Math.max(2, settings.dpi / 240);
        ctx.setLineDash([16, 12]);
        ctx.strokeRect(rect.x + safe, rect.y + safe, rect.width - safe * 2, rect.height - safe * 2);
        ctx.restore();
      }
    });

    if (settings.showTextLayer) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.88)";
      const boxWidth = pair.front.width * 0.46;
      const boxHeight = pair.front.height * 0.43;
      const x = pair.front.x + pair.front.width - boxWidth - pair.front.width * 0.035;
      const y = pair.front.y + pair.front.height - boxHeight - pair.front.height * 0.05;
      roundRect(ctx, x, y, boxWidth, boxHeight, 18);
      ctx.fill();
      ctx.fillStyle = settings.textColor;
      ctx.textAlign = "left";
      ctx.font = `900 ${Math.max(16, pair.front.height * 0.065)}px Arial`;
      ctx.fillText(settings.text.name, x + boxWidth * 0.08, y + boxHeight * 0.22);
      ctx.font = `700 ${Math.max(13, pair.front.height * 0.047)}px Arial`;
      ctx.fillText(settings.text.idNumber, x + boxWidth * 0.08, y + boxHeight * 0.43);
      ctx.fillText(settings.text.company, x + boxWidth * 0.08, y + boxHeight * 0.62);
      ctx.fillText(settings.text.date, x + boxWidth * 0.08, y + boxHeight * 0.81);
      if (settings.text.custom) {
        ctx.font = `900 ${Math.max(12, pair.back.height * 0.045)}px Arial`;
        ctx.fillText(settings.text.custom, pair.back.x + pair.back.width * 0.06, pair.back.y + pair.back.height * 0.88);
      }
      ctx.restore();
    }

    if (settings.showQr) {
      const size = Math.min(pair.back.width, pair.back.height) * 0.24;
      drawQrStyle(ctx, pair.back.x + pair.back.width - size - pair.back.width * 0.04, pair.back.y + pair.back.height * 0.08, size, settings.qrText);
    }
    if (settings.showBarcode) {
      drawBarcode(ctx, pair.back.x + pair.back.width * 0.08, pair.back.y + pair.back.height * 0.62, pair.back.width * 0.55, pair.back.height * 0.18, settings.barcodeText);
    }
  });

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

function ImageUploadCard({
  side,
  image,
  onFile
}: {
  side: Side;
  image: UploadedImage | null;
  onFile: (side: Side, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = side === "front" ? "Front ID Image" : "Back ID Image";
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(side, file);
  };
  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="rounded-3xl border border-dashed border-blue-300 bg-blue-50/60 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden" onChange={(event) => event.target.files?.[0] && onFile(side, event.target.files[0])} />
      <div className="flex gap-3">
        <button type="button" onClick={() => inputRef.current?.click()} className="flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          {image ? <img src={image.dataUrl} alt={label} className="h-full w-full object-contain" /> : <ImagePlus className="h-8 w-8 text-blue-600" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-black">{label}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Drag/drop or upload JPG/PNG</p>
          {image && (
            <p className="mt-2 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">
              {image.name}<br />{image.naturalWidth}×{image.naturalHeight}px · {bytesToSize(image.size)}
            </p>
          )}
          <ToolButton onClick={() => inputRef.current?.click()} variant="primary" title="Upload image">
            <Upload className="h-4 w-4" /> {image ? "Replace" : "Upload"}
          </ToolButton>
        </div>
      </div>
    </div>
  );
}

export default function AdvancedIdCardStudio({
  onSwitchClassic,
  onSwitchPassport
}: {
  onSwitchClassic?: () => void;
  onSwitchPassport?: () => void;
}) {
  const [settings, setSettings] = useState<AdvancedIdSettings>(DEFAULT_SETTINGS);
  const [front, setFront] = useState<UploadedImage | null>(null);
  const [back, setBack] = useState<UploadedImage | null>(null);
  const [frontImage, setFrontImage] = useState<HTMLImageElement | null>(null);
  const [backImage, setBackImage] = useState<HTMLImageElement | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cropSide, setCropSide] = useState<Side | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const undoStack = useRef<AdvancedIdSettings[]>([]);
  const redoStack = useRef<AdvancedIdSettings[]>([]);
  const layout = useMemo(() => getLayout(settings), [settings]);

  const updateSettings = useCallback((patch: Partial<AdvancedIdSettings>) => {
    setSettings((previous) => {
      undoStack.current.push(previous);
      if (undoStack.current.length > 100) undoStack.current.shift();
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
    if (!front) {
      setFrontImage(null);
      return;
    }
    loadImage(front.dataUrl).then(setFrontImage);
  }, [front]);

  useEffect(() => {
    if (!back) {
      setBackImage(null);
      return;
    }
    loadImage(back.dataUrl).then(setBackImage);
  }, [back]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = layout.paper.pixelWidth;
    canvas.height = layout.paper.pixelHeight;
    const ctx = canvas.getContext("2d", { alpha: settings.backgroundMode === "transparent" || settings.pngTransparent });
    if (!ctx) return;
    drawSheet(ctx, settings, frontImage, backImage, false);
  }, [settings, frontImage, backImage, layout.paper.pixelWidth, layout.paper.pixelHeight]);

  useEffect(() => {
    localStorage.setItem("advanced-id-card-project-autosave", JSON.stringify({ settings, front, back }));
  }, [settings, front, back]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const previous = undoStack.current.pop();
        if (previous) {
          redoStack.current.push(settings);
          setSettings(previous);
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        const next = redoStack.current.pop();
        if (next) {
          undoStack.current.push(settings);
          setSettings(next);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settings]);

  const handleFile = useCallback(async (side: Side, file: File) => {
    if (!/image\/(png|jpe?g)/i.test(file.type)) {
      setMessage("Please upload JPG, JPEG, or PNG only.");
      return;
    }
    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);
    const payload = { name: file.name, dataUrl, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, size: file.size };
    if (side === "front") {
      setFront(payload);
      setFrontImage(img);
    } else {
      setBack(payload);
      setBackImage(img);
    }
    setMessage(`${side === "front" ? "Front" : "Back"} image uploaded.`);
  }, []);

  const loadDemo = useCallback(() => {
    const demoFront = makeDemoImage("front");
    const demoBack = makeDemoImage("back");
    setFront(demoFront);
    setBack(demoBack);
    loadImage(demoFront.dataUrl).then(setFrontImage);
    loadImage(demoBack.dataUrl).then(setBackImage);
    setMessage("Demo ID card loaded with advanced print features.");
  }, []);

  const exportDataUrl = useCallback(
    (type: "image/png" | "image/jpeg") => {
      const offscreen = document.createElement("canvas");
      offscreen.width = layout.paper.pixelWidth;
      offscreen.height = layout.paper.pixelHeight;
      const ctx = offscreen.getContext("2d", { alpha: type === "image/png" && settings.pngTransparent });
      if (!ctx) return null;
      drawSheet(ctx, settings, frontImage, backImage, true);
      return offscreen.toDataURL(type, type === "image/jpeg" ? settings.jpgQuality / 100 : undefined);
    },
    [backImage, frontImage, layout.paper.pixelHeight, layout.paper.pixelWidth, settings]
  );

  const downloadPNG = useCallback(() => {
    const dataUrl = exportDataUrl("image/png");
    if (!dataUrl) return;
    downloadDataUrl(dataUrl, `advanced-id-card-sheet-${settings.dpi}dpi.png`);
  }, [exportDataUrl, settings.dpi]);

  const downloadJPG = useCallback(() => {
    const dataUrl = exportDataUrl("image/jpeg");
    if (!dataUrl) return;
    downloadDataUrl(dataUrl, `advanced-id-card-sheet-${settings.dpi}dpi.jpg`);
  }, [exportDataUrl, settings.dpi]);

  const downloadPDF = useCallback(() => {
    const dataUrl = exportDataUrl("image/png");
    if (!dataUrl) return;
    const pdf = new jsPDF({
      orientation: layout.paper.widthIn > layout.paper.heightIn ? "landscape" : "portrait",
      unit: "in",
      format: [layout.paper.widthIn, layout.paper.heightIn],
      compress: settings.pdfCompress,
      precision: 16
    });
    pdf.setProperties({ title: `Advanced ID Card Sheet ${settings.dpi} DPI`, creator: "Professional ID Card Print Editor" });
    pdf.addImage(dataUrl, "PNG", 0, 0, layout.paper.widthIn, layout.paper.heightIn, undefined, settings.pdfCompress ? "FAST" : "NONE");
    pdf.save(`advanced-id-card-sheet-${settings.dpi}dpi.pdf`);
  }, [exportDataUrl, layout.paper, settings.dpi, settings.pdfCompress]);

  const printSheet = useCallback(() => {
    const dataUrl = exportDataUrl("image/png");
    if (!dataUrl) return;
    const win = window.open("", "_blank");
    if (!win) {
      setMessage("Popup blocked. Please download PDF instead.");
      return;
    }
    win.document.write(`<!doctype html><html><head><title>Print ID Sheet</title><style>@page{size:${layout.paper.widthIn}in ${layout.paper.heightIn}in;margin:0}html,body{margin:0;width:${layout.paper.widthIn}in;height:${layout.paper.heightIn}in;background:white}img{display:block;width:${layout.paper.widthIn}in;height:${layout.paper.heightIn}in}</style></head><body><img src="${dataUrl}" onload="setTimeout(()=>print(),250)" /></body></html>`);
    win.document.close();
  }, [exportDataUrl, layout.paper]);

  const saveProject = useCallback(() => {
    const blob = new Blob([JSON.stringify({ settings, front, back }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, "advanced-id-card-project.json");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [back, front, settings]);

  const loadProject = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { settings?: AdvancedIdSettings; front?: UploadedImage | null; back?: UploadedImage | null };
      if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      if (parsed.front) setFront(parsed.front);
      if (parsed.back) setBack(parsed.back);
      setMessage("Project loaded.");
    } catch {
      setMessage("Could not load project JSON.");
    }
  }, []);

  const loadAutosave = useCallback(() => {
    const saved = localStorage.getItem("advanced-id-card-project-autosave");
    if (!saved) return setMessage("No autosave found.");
    try {
      const parsed = JSON.parse(saved) as { settings?: AdvancedIdSettings; front?: UploadedImage | null; back?: UploadedImage | null };
      if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
      if (parsed.front) setFront(parsed.front);
      if (parsed.back) setBack(parsed.back);
      setMessage("Autosave loaded.");
    } catch {
      setMessage("Autosave could not be loaded.");
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

  const selectedCrop = cropSide === "front" ? settings.frontCrop : settings.backCrop;
  const selectedCropKey = cropSide === "front" ? "frontCrop" : "backCrop";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,#dbeafe_0,transparent_38%),radial-gradient(circle_at_top_right,#ede9fe_0,transparent_34%),linear-gradient(180deg,#f8fafc,#eef2ff)] px-3 pb-24 pt-4 text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,.22)_0,transparent_32%),radial-gradient(circle_at_top_right,rgba(168,85,247,.18)_0,transparent_32%),linear-gradient(180deg,#020617,#0f172a)] dark:text-white sm:px-5 lg:px-8 xl:pb-4">
      {message && <div className="fixed right-4 top-4 z-50 max-w-md rounded-2xl border border-blue-200 bg-white/95 p-4 text-sm font-bold text-slate-800 shadow-glow backdrop-blur-xl dark:border-blue-500/30 dark:bg-slate-950/95 dark:text-slate-100">{message}</div>}
      <div className="mx-auto max-w-[1800px]">
        <header className="glass-card mb-4 rounded-[2rem] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                <BadgePlus className="h-3.5 w-3.5" /> Advanced ID Card Studio · Multi Sheet · 300/600 DPI
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-4xl">Advanced ID Card Print Editor</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Preset paper sizes, 1/2/4 ID pairs per page, guides, manual spacing, custom backgrounds, image enhancement, text, QR/barcode, save/load, undo/redo, mobile toolbar, crop modal, watermark, and print-ready export.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {onSwitchClassic && <ToolButton onClick={onSwitchClassic}>Classic Editor</ToolButton>}
              {onSwitchPassport && <ToolButton onClick={onSwitchPassport}><Smartphone className="h-4 w-4" /> Passport 8 Photos</ToolButton>}
              <ToolButton onClick={loadDemo}><Wand2 className="h-4 w-4" /> Load Demo</ToolButton>
              <ToolButton onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {darkMode ? "Light" : "Dark"}</ToolButton>
              <ToolButton onClick={printSheet} variant="primary"><Printer className="h-4 w-4" /> Print</ToolButton>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[370px_minmax(0,1fr)] 2xl:grid-cols-[390px_minmax(0,1fr)_410px]">
          <aside className="space-y-4">
            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Upload className="h-5 w-5 text-blue-600" /> Upload</h2>
              <div className="space-y-3">
                <ImageUploadCard side="front" image={front} onFile={handleFile} />
                <ImageUploadCard side="back" image={back} onFile={handleFile} />
              </div>
            </div>

            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Settings2 className="h-5 w-5 text-blue-600" /> Paper & Multi Cards</h2>
              <div className="grid gap-3">
                <label><span className="mb-1 block text-xs font-black text-slate-500">Paper size</span><select className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/50" value={settings.paperKey} onChange={(e) => updateSettings({ paperKey: e.target.value as PaperKey })}>{Object.entries(PAPER_PRESETS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}<option value="custom">Custom size</option></select></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="radio" checked={settings.orientation === "portrait"} onChange={() => updateSettings({ orientation: "portrait" })} /> Portrait</label>
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="radio" checked={settings.orientation === "landscape"} onChange={() => updateSettings({ orientation: "landscape" })} /> Landscape</label>
                </div>
                {settings.paperKey === "custom" && <div className="grid grid-cols-2 gap-2"><NumberField label="Width" value={settings.customWidthIn} min={2} max={20} step={0.1} suffix="in" onChange={(v) => updateSettings({ customWidthIn: v })} /><NumberField label="Height" value={settings.customHeightIn} min={2} max={20} step={0.1} suffix="in" onChange={(v) => updateSettings({ customHeightIn: v })} /></div>}
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 4].map((count) => <ToolButton key={count} onClick={() => updateSettings({ pairCount: count as 1 | 2 | 4 })} variant={settings.pairCount === count ? "primary" : "secondary"}>{count} Pair{count > 1 ? "s" : ""}</ToolButton>)}
                </div>
                <div className="grid grid-cols-2 gap-2"><NumberField label="Card width" value={settings.cardWidthMm} min={40} max={120} step={0.5} suffix="mm" onChange={(v) => updateSettings({ cardWidthMm: v })} /><NumberField label="Card height" value={settings.cardHeightMm} min={25} max={90} step={0.5} suffix="mm" onChange={(v) => updateSettings({ cardHeightMm: v })} /></div>
                <ToolButton onClick={() => updateSettings({ dpi: settings.dpi === 600 ? 300 : 600 })} variant="primary">{settings.dpi} DPI Export</ToolButton>
              </div>
            </div>
          </aside>

          <section className="glass-card min-w-0 overflow-hidden rounded-[2rem]">
            <div className="flex flex-col gap-3 border-b border-white/60 p-4 dark:border-slate-700/50 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-lg font-black">Live Sheet Preview</h2><p className="text-xs text-slate-500 dark:text-slate-400">{layout.paper.widthIn.toFixed(2)}×{layout.paper.heightIn.toFixed(2)} in · {layout.paper.pixelWidth}×{layout.paper.pixelHeight}px · {settings.pairCount} pair(s)</p></div>
              <div className="flex flex-wrap gap-2"><ToolButton onClick={undo} disabled={!undoStack.current.length}><Undo2 className="h-4 w-4" /> Undo</ToolButton><ToolButton onClick={redo} disabled={!redoStack.current.length}><Redo2 className="h-4 w-4" /> Redo</ToolButton><ToolButton onClick={() => updateSettings(DEFAULT_SETTINGS)}><RefreshCcw className="h-4 w-4" /> Reset</ToolButton></div>
            </div>
            <div className="fine-grid overflow-x-hidden p-3 sm:p-5">
              <div className="mx-auto max-w-full rounded-[1.5rem] bg-slate-900/10 p-2 shadow-2xl dark:bg-black/35 sm:p-4">
                <canvas ref={canvasRef} className="mx-auto block h-auto max-h-[74vh] w-auto max-w-full bg-white shadow-[0_25px_80px_rgba(15,23,42,.22)]" />
              </div>
              {!layout.fits && <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Layout may not fit. Reduce card size, pair count, margins, or use A4/Letter.</div>}
            </div>
          </section>

          <aside className="space-y-4 xl:col-span-2 2xl:col-span-1">
            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><SlidersHorizontal className="h-5 w-5 text-blue-600" /> Enhancement</h2>
              <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                <RangeControl label="Brightness" value={settings.brightness} min={50} max={160} suffix="%" onChange={(v) => updateSettings({ brightness: v })} />
                <RangeControl label="Contrast" value={settings.contrast} min={50} max={180} suffix="%" onChange={(v) => updateSettings({ contrast: v })} />
                <RangeControl label="Saturation" value={settings.saturation} min={0} max={220} suffix="%" onChange={(v) => updateSettings({ saturation: v })} />
                <RangeControl label="Sharpen" value={settings.sharpen} min={0} max={100} suffix="%" onChange={(v) => updateSettings({ sharpen: v })} />
                <RangeControl label="Grayscale" value={settings.grayscale} min={0} max={100} suffix="%" onChange={(v) => updateSettings({ grayscale: v })} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2"><ToolButton onClick={() => setCropSide("front")}><Crop className="h-4 w-4" /> Front Crop</ToolButton><ToolButton onClick={() => setCropSide("back")}><Crop className="h-4 w-4" /> Back Crop</ToolButton></div>
            </div>

            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Grid3X3 className="h-5 w-5 text-blue-600" /> Spacing & Guides</h2>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Top margin" value={settings.topMarginMm} min={0} max={60} step={0.5} suffix="mm" onChange={(v) => updateSettings({ topMarginMm: v, autoEqualGap: false })} />
                <NumberField label="Side margin" value={settings.sideMarginMm} min={0} max={60} step={0.5} suffix="mm" onChange={(v) => updateSettings({ sideMarginMm: v, autoEqualGap: false })} />
                <NumberField label="Pair gap" value={settings.pairGapMm} min={0} max={60} step={0.5} suffix="mm" onChange={(v) => updateSettings({ pairGapMm: v, autoEqualGap: false })} />
                <NumberField label="Front/back gap" value={settings.frontBackGapMm} min={0} max={60} step={0.5} suffix="mm" onChange={(v) => updateSettings({ frontBackGapMm: v })} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.autoEqualGap} onChange={(e) => updateSettings({ autoEqualGap: e.target.checked })} /> Equal gap</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.snapToGuides} onChange={(e) => updateSettings({ snapToGuides: e.target.checked })} /> Snap guides</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showPrintBoundary} onChange={(e) => updateSettings({ showPrintBoundary: e.target.checked })} /> Print boundary</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showCutLine} onChange={(e) => updateSettings({ showCutLine: e.target.checked })} /> Cut line</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showSafeMargin} onChange={(e) => updateSettings({ showSafeMargin: e.target.checked })} /> Safe margin</label>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2"><ToolButton onClick={() => updateSettings({ align: "left", autoEqualGap: false })}>Left</ToolButton><ToolButton onClick={() => updateSettings({ align: "center", autoEqualGap: false })}><AlignCenter className="h-4 w-4" /> Center</ToolButton><ToolButton onClick={() => updateSettings({ align: "right", autoEqualGap: false })}>Right</ToolButton></div>
            </div>

            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Palette className="h-5 w-5 text-blue-600" /> Background & Layers</h2>
              <div className="grid grid-cols-2 gap-2">
                {(["white", "custom", "gradient", "transparent"] as BackgroundMode[]).map((mode) => <ToolButton key={mode} onClick={() => updateSettings({ backgroundMode: mode, pngTransparent: mode === "transparent" })} variant={settings.backgroundMode === mode ? "primary" : "secondary"}>{mode}</ToolButton>)}
                <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">Custom</span><input type="color" className="h-11 w-full rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950" value={settings.backgroundColor} onChange={(e) => updateSettings({ backgroundColor: e.target.value, backgroundMode: "custom" })} /></label>
                <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">Gradient 1</span><input type="color" className="h-11 w-full rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950" value={settings.gradientFrom} onChange={(e) => updateSettings({ gradientFrom: e.target.value, backgroundMode: "gradient" })} /></label>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showTextLayer} onChange={(e) => updateSettings({ showTextLayer: e.target.checked })} /> <Type className="h-4 w-4" /> Text layer</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showQr} onChange={(e) => updateSettings({ showQr: e.target.checked })} /> <QrCode className="h-4 w-4" /> QR</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showBarcode} onChange={(e) => updateSettings({ showBarcode: e.target.checked })} /> Barcode</label>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.showWatermark} onChange={(e) => updateSettings({ showWatermark: e.target.checked })} /> Watermark</label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2"><TextInput label="Name" value={settings.text.name} onChange={(v) => updateSettings({ text: { ...settings.text, name: v } })} /><TextInput label="ID Number" value={settings.text.idNumber} onChange={(v) => updateSettings({ text: { ...settings.text, idNumber: v }, barcodeText: v })} /><TextInput label="Company" value={settings.text.company} onChange={(v) => updateSettings({ text: { ...settings.text, company: v } })} /><TextInput label="Date" value={settings.text.date} onChange={(v) => updateSettings({ text: { ...settings.text, date: v } })} /></div>
              <RangeControl label="Watermark opacity" value={settings.watermarkOpacity} min={2} max={60} suffix="%" onChange={(v) => updateSettings({ watermarkOpacity: v })} />
            </div>

            <div className="glass-card rounded-[2rem] p-4">
              <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Download className="h-5 w-5 text-blue-600" /> Export & Project</h2>
              <input ref={projectInputRef} type="file" accept="application/json" className="hidden" onChange={loadProject} />
              <RangeControl label="JPG quality" value={settings.jpgQuality} min={50} max={100} suffix="%" onChange={(v) => updateSettings({ jpgQuality: v })} />
              <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                <ToolButton onClick={downloadPNG} variant="primary"><FileImage className="h-4 w-4" /> PNG</ToolButton>
                <ToolButton onClick={downloadJPG}><FileImage className="h-4 w-4" /> JPG</ToolButton>
                <ToolButton onClick={downloadPDF}><FileText className="h-4 w-4" /> PDF</ToolButton>
                <ToolButton onClick={saveProject}><Save className="h-4 w-4" /> Save JSON</ToolButton>
                <ToolButton onClick={() => projectInputRef.current?.click()}><FileJson className="h-4 w-4" /> Load JSON</ToolButton>
                <ToolButton onClick={loadAutosave}><RefreshCcw className="h-4 w-4" /> Autosave</ToolButton>
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-sm font-bold dark:border-slate-700 dark:bg-slate-950/35"><input type="checkbox" checked={settings.pdfCompress} onChange={(e) => updateSettings({ pdfCompress: e.target.checked })} /> PDF compression</label>
              </div>
            </div>
          </aside>
        </section>
      </div>

      <div className="fixed inset-x-3 bottom-3 z-40 rounded-3xl border border-white/60 bg-white/90 p-2 shadow-glow backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/90 xl:hidden">
        <div className="grid grid-cols-5 gap-2">
          <ToolButton onClick={downloadPNG} variant="primary"><Download className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => setCropSide("front")}><Crop className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={() => updateSettings({ autoEqualGap: true })}><AlignCenter className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={undo}><Undo2 className="h-4 w-4" /></ToolButton>
          <ToolButton onClick={redo}><Redo2 className="h-4 w-4" /></ToolButton>
        </div>
      </div>

      {cropSide && selectedCrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-slate-950/85 p-4 backdrop-blur-xl">
          <div className="w-full max-w-3xl rounded-[2rem] border border-white/10 bg-white p-5 shadow-2xl dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-xl font-black">{cropSide === "front" ? "Front" : "Back"} Crop Editor</h2><p className="text-sm text-slate-500 dark:text-slate-400">Move image inside crop area and apply to every repeated card.</p></div><ToolButton onClick={() => setCropSide(null)}>Apply / Close</ToolButton></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <RangeControl label="Zoom" value={Number(selectedCrop.zoom.toFixed(2))} min={0.5} max={3} step={0.01} suffix="×" onChange={(v) => updateSettings({ [selectedCropKey]: { ...selectedCrop, zoom: v } } as Partial<AdvancedIdSettings>)} />
              <RangeControl label="Move X" value={selectedCrop.x} min={-100} max={100} onChange={(v) => updateSettings({ [selectedCropKey]: { ...selectedCrop, x: v } } as Partial<AdvancedIdSettings>)} />
              <RangeControl label="Move Y" value={selectedCrop.y} min={-100} max={100} onChange={(v) => updateSettings({ [selectedCropKey]: { ...selectedCrop, y: v } } as Partial<AdvancedIdSettings>)} />
              <RangeControl label="Rotate" value={selectedCrop.rotation} min={-180} max={180} suffix="°" onChange={(v) => updateSettings({ [selectedCropKey]: { ...selectedCrop, rotation: v } } as Partial<AdvancedIdSettings>)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2"><ToolButton onClick={() => updateSettings({ [selectedCropKey]: { zoom: 1, x: 0, y: 0, rotation: 0 } } as Partial<AdvancedIdSettings>)}><RotateCcw className="h-4 w-4" /> Reset Crop</ToolButton></div>
          </div>
        </div>
      )}
    </main>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block"><span className="mb-1 block text-xs font-black text-slate-500">{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm font-bold outline-none dark:border-slate-700 dark:bg-slate-950/40" /></label>
  );
}
