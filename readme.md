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

## API Reference

### `PNGPaletteImage`

The main class representing a palette-based PNG image.

#### Constructor
- `new PNGPaletteImage(width: number, height: number, maxColors?: number)`: Creates a new image. Default `maxColors` is 256.

#### Methods
- `static fromPngBytes(bytes: Uint8Array): PNGPaletteImage`: Decodes a PNG file from a byte array.
- `setPaletteColor(index: number, r: number, g: number, b: number): void`: Sets the RGB value for a specific palette index (0-255).
- `getPaletteColor(index: number): RGB | undefined`: Gets the RGB value for a specific palette index.
- `setTransparency(index: number, alpha: number): void`: Sets the alpha value (0-255) for a specific palette index.
- `getTransparency(index: number): number | undefined`: Gets the alpha value for a specific palette index.
- `setPixelPaletteIndex(x: number, y: number, colorIndex: number): void`: Sets the palette index for a specific pixel.
- `getPixelPaletteIndex(x: number, y: number): number`: Gets the palette index for a specific pixel.
- `encodeToPngBytes(): Uint8Array`: Encodes the current image and palette into a standard PNG file byte array.

## Development

### Build
```bash
npm run build
```

### Run Tests
```bash
npm test
```

## License
ISC