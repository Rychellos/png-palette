# PNG palette library (`png-palette`)

Small library to help working with palette based PNGs. It provides low-level control over the `PLTE` (Palette) and `tRNS` (Transparency) chunks, making it ideal for creating indexed-color images directly.

## Features

- **Palette Control**: Easily set and get RGB colors in the palette.
- **Transparency Support**: Set alpha values for individual palette indices via the `tRNS` chunk.
- **Efficient Encoding/Decoding**: Fast round-trip between raw bytes and a manipulatable image object.
- **Minimal Dependencies**: Lightweight with only `pako` for compression and `crc-32` for integrity checks.

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
img.setPaletteColor(0, 255, 255, 255); // Index 0: White
img.setPaletteColor(1, 255, 0, 0);     // Index 1: Red
img.setPaletteColor(2, 0, 0, 255);     // Index 2: Blue

// 3. Set transparency (optional)
img.setTransparency(0, 0); // Index 0 is fully transparent

// 4. Draw pixels using palette indices
for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
        img.setPixelPaletteIndex(x, y, (x + y) % 2 === 0 ? 1 : 2);
    }
}

// 5. Encode to PNG bytes
const pngBytes = img.encodeToPngBytes();

// 6. Save to a file
fs.writeFileSync("output.png", pngBytes);

// 7. Load from existing bytes
const loadedImg = PNGPaletteImage.fromPngBytes(pngBytes);
console.log(`Loaded image size: ${loadedImg.width}x${loadedImg.height}`);
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