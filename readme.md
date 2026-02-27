# PNG palette library (`png-palette`)

Small library to help working with palette based PNGs. It provides low-level control over the `PLTE` (Palette) and `tRNS` (Transparency) chunks, making it ideal for creating indexed-color images directly.

## Features

- **Great Error Handling**: Uses the `neverthrow` package for type-safe error management.
- **Palette Control**: Easily set, get, or bulk-assign RGB(A) colors in the palette.
- **Transparency Support**: Full control over alpha values via the `tRNS` chunk.
- **RGBA to Indexed Conversion**: Create palette images from raw RGBA data with optional quantization.
- **Full Filter Support**: Supports all standard PNG scanline filters for reliable decoding.
- **Lightweight**: Uses only `pako` for compression and `crc-32` for integrity checks.

## Installation

```bash
npm install png-palette
# or
pnpm add png-palette
```

## Programmatic Usage

```typescript
import { PNGPaletteImage } from "png-palette";
import * as fs from "fs";

// 1. Create a new 10x10 image
const img = new PNGPaletteImage(10, 10);

// 2. Define colors in the palette
img.setPaletteColor(0, 255, 255, 255);      // Index 0: White
img.setPaletteColor(1, 255, 0, 0);          // Index 1: Red
img.setPaletteColor(2, 0, 0, 255, 128);     // Index 2: Semi-transparent Blue

// 3. Draw pixels using palette indices
// Most methods return a Result object for safety
img.setPixelPaletteIndex(5, 5, 1).unwrapOr(undefined);

// 4. Encode to PNG bytes
const pngBytes = img.encodeToPngBytes();

// 5. Save to a file
fs.writeFileSync("output.png", pngBytes);

// 6. Load from existing bytes
const decodeResult = PNGPaletteImage.fromPngBytes(pngBytes);
if (decodeResult.isOk()) {
    const loadedImg = decodeResult.value;
    console.log(`Loaded image size: ${loadedImg.width}x${loadedImg.height}`);
}

// 7. Convert from RGBA data
const rgba = new Uint8Array(10 * 10 * 4); // ... raw RGBA data ...
const convertedResult = PNGPaletteImage.fromRgbaBytes(rgba, 10, 10, { quantize: true });
```

## Development

### Build
```bash
npm run build
```

### Run Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```