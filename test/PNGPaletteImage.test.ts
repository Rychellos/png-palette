import { describe, it, expect } from 'vitest';
import { PNGPaletteImage } from '../src/PNGPaletteImage.js';

describe('PNGPaletteImage', () => {
    it('should initialize with correct dimensions', () => {
        const img = new PNGPaletteImage(100, 200);
        expect(img.width).toBe(100);
        expect(img.height).toBe(200);
    });

    it('should set and get palette colors', () => {
        const img = new PNGPaletteImage(10, 10);
        img.setPaletteColor(1, 255, 0, 0);
        expect(img.getPaletteColor(1)).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should handle round-trip encoding and decoding (Checkerboard)', () => {
        const img = new PNGPaletteImage(8, 8);
        img.setPaletteColor(10, 0, 0, 0);
        img.setPaletteColor(20, 255, 0, 0);

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const color = (x + y) % 2 === 0 ? 10 : 20;
                img.setPixelPaletteIndex(x, y, color);
            }
        }

        const pngBytes = img.encodeToPngBytes();
        const decodedImg = PNGPaletteImage.fromPngBytes(pngBytes);

        expect(decodedImg.width).toBe(8);
        expect(decodedImg.height).toBe(8);

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const expectedColor = (x + y) % 2 === 0 ? 10 : 20;
                expect(decodedImg.getPixelPaletteIndex(x, y)).toBe(expectedColor);
            }
        }
    });

    it('should preserve transparency on round-trip', () => {
        const img = new PNGPaletteImage(4, 4);
        img.setPaletteColor(5, 255, 255, 255);
        img.setTransparency(5, 128);

        const pngBytes = img.encodeToPngBytes();
        const decodedImg = PNGPaletteImage.fromPngBytes(pngBytes);

        expect(decodedImg.getTransparency(5)).toBe(128);
    });
    
    it('should respect maxColors in the encoded PNG (Short Palette)', () => {
        const img = new PNGPaletteImage(1, 1, 8);
        img.setPaletteColor(0, 255, 255, 255);
        img.setPixelPaletteIndex(0, 0, 0);

        const pngBytes = img.encodeToPngBytes();

        let plteSize = -1;
        const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
        for (let i = 8; i < pngBytes.length - 12;) {
            const len = view.getUint32(i, false);
            const type = String.fromCharCode(pngBytes[i + 4], pngBytes[i + 5], pngBytes[i + 6], pngBytes[i + 7]);
            if (type === 'PLTE') {
                plteSize = len;
                break;
            }
            i += 12 + len;
        }

        expect(plteSize).toBe(24);
    });
});
