# Professional ID Card Print Editor

Live DEmo--- https://id-card-print-editor.vercel.app/

A production-ready **Next.js App Router + React + TypeScript + Tailwind CSS + React-Konva** editor for creating a single 4×5 inch print sheet containing front and back ID card images.

## Features

- Three studios in one app: **Advanced ID Card Studio**, **Classic ID Card Editor**, and **Passport Photo Studio**
- Advanced ID Card Studio includes preset paper sizes, multiple ID pairs per page, bleed/safe guides, manual spacing, background modes, image enhancement, export controls, text layers, QR/barcode, save/load/autosave, undo/redo, alignment tools, mobile bottom toolbar, crop modal, and watermark
- Passport Photo Studio creates **8 passport-size photos** from 1 upload on glossy **4×6 / 10×15 cm** paper
- Passport photo tools: crop, brightness, contrast, saturation/color, hue, grayscale, warmth/sepia, rotation, QR/barcode marks, watermark, cut guides, safe area, save/load project, autosave, undo/redo
- One-click **Load Demo** button so you can test the editor immediately without uploading files
- Upload front and back ID card images
- JPG, JPEG, and PNG support
- Drag-and-drop upload with instant preview
- Fixed 4×5 inch white print canvas
- Exact 600 DPI ultra-HD output: **2400 × 3000 px**
- Automatic layout: front image at top, back image below, equal spacing, center aligned
- Drag, reposition, resize, zoom, rotate, and center-crop/fill controls
- Image quality / effective DPI indicator
- Live print preview with zoom controls
- Print preview mode and browser print support
- Adjustable PDF / print layout card size from 70% to 120% with automatic equal spacing
- Download as print-ready PNG, JPG, or PDF
- Dark mode
- Keyboard shortcuts
- Responsive glassmorphism interface

## Tech Stack

- Next.js App Router
- React Hooks
- TypeScript
- Tailwind CSS
- React-Konva / Konva canvas editor
- jsPDF for PDF export
- html2canvas included for preview/snapshot workflows

## Output Specification

ID Card Editor exports a single page containing:

- Front ID card image
- Back ID card image
- White background `#FFFFFF`
- 4×5 inch layout
- 600 DPI ultra-HD quality
- 2400×3000 pixel canvas
- No editor handles or UI overlays
- Optional card-size layout scaling before export

Passport Photo Studio exports a single glossy paper sheet containing:

- 8 repeated passport photos from one upload
- Default glossy 4×6 inch / 10×15 cm landscape paper
- 35×45 mm photo preset, adjustable to custom dimensions
- 600 DPI ultra-HD export by default
- PNG, JPG, and exact-size PDF download

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production Build

```bash
npm run build
npm run start
```

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Move selected image | Arrow keys |
| Fast move | Shift + Arrow keys |
| Zoom selected image | `+` / `-` |
| Rotate selected image | `[` / `]` or `Q` / `E` |
| Reset layout | Ctrl/Cmd + 0 |
| Download PNG | Ctrl/Cmd + S |
| Remove selected image | Delete / Backspace |

## Printing Notes

For best 4×5 inch output:

1. Use glossy/photo paper settings in your printer dialog.
2. Disable browser/printer scaling if available, or choose 100% scale.
3. Use borderless/no-margin printing when supported by the printer.
4. Prefer high-resolution uploads; the built-in quality indicator estimates effective print DPI.
