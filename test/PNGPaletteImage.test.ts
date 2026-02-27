import { describe, it, expect } from "vitest";
import { PNGPaletteImage } from "../src/PNGPaletteImage.js";
import pako from "pako";
import CRC32 from "crc-32";

describe("PNGPaletteImage", () => {
    it("should initialize with correct dimensions", () => {
        const img = new PNGPaletteImage(100, 200);

        expect(img.width).toBe(100);
        expect(img.height).toBe(200);
    });

    it("should set and get palette colors", () => {
        const img = new PNGPaletteImage(10, 10);
        const result = img.setPaletteColor(1, 255, 0, 0, 128);

        expect(result.isOk()).toBe(true);

        const color = img.getPaletteColor(1);

        expect(color.isOk()).toBe(true);
        expect(color._unsafeUnwrap()).toEqual({ r: 255, g: 0, b: 0, a: 128 });
    });

    it("should handle bulk palette assignment", () => {
        const img = new PNGPaletteImage(10, 10);
        const colors = [
            { r: 255, g: 0, b: 0, a: 255 },
            { r: 0, g: 255, b: 0, a: 255 },
        ];

        const result = img.assignPalette(colors);

        expect(result.isOk()).toBe(true);

        expect(img.getPaletteColor(0)._unsafeUnwrap().r).toBe(255);
        expect(img.getPaletteColor(1)._unsafeUnwrap().g).toBe(255);
    });

    it("should handle round-trip encoding and decoding (Checkerboard)", () => {
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
        const decodedResult = PNGPaletteImage.fromPngBytes(pngBytes);

        expect(decodedResult.isOk()).toBe(true);
        const decodedImg = decodedResult._unsafeUnwrap();

        expect(decodedImg.width).toBe(8);
        expect(decodedImg.height).toBe(8);

        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                const expectedColor = (x + y) % 2 === 0 ? 10 : 20;
                expect(decodedImg.getPixelPaletteIndex(x, y)._unsafeUnwrap()).toBe(
                    expectedColor,
                );
            }
        }
    });

    it("should convert from RGBA bytes", () => {
        const width = 2;
        const height = 2;
        const rgba = new Uint8Array([
            255, 0, 0, 255,  // Red
            0, 255, 0, 255,  // Green
            0, 0, 255, 255,  // Blue
            255, 255, 255, 255 // White
        ]);

        const result = PNGPaletteImage.fromRgbaBytes(rgba, width, height);
        expect(result.isOk()).toBe(true);
        const img = result._unsafeUnwrap();

        expect(img.getPixelPaletteIndex(0, 0)._unsafeUnwrap()).toBe(0);
        expect(img.getPixelPaletteIndex(1, 0)._unsafeUnwrap()).toBe(1);
        expect(img.getPaletteColor(0)._unsafeUnwrap().r).toBe(255);
    });

    it("should fail from RGBA bytes if too many colors and no quantize", () => {
        const width = 512;
        const height = 1;
        const rgba = new Uint8Array(width * 4);

        for (let i = 0; i < width; i++) {
            rgba[i * 4] = i % 256;
            rgba[i * 4 + 1] = Math.floor(i / 256);
            rgba[i * 4 + 2] = 0;
            rgba[i * 4 + 3] = 255;
        }

        const result = PNGPaletteImage.fromRgbaBytes(rgba, width, height, { quantize: false });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().message).toContain("too many unique colors");
    });

    it("should succeed from RGBA bytes with quantization", () => {
        const width = 512;
        const height = 1;
        const rgba = new Uint8Array(width * 4);

        for (let i = 0; i < width; i++) {
            rgba[i * 4] = i % 256;
            rgba[i * 4 + 1] = Math.floor(i / 256);
            rgba[i * 4 + 2] = 0;
            rgba[i * 4 + 3] = 255;
        }

        const result = PNGPaletteImage.fromRgbaBytes(rgba, width, height, { quantize: true });

        expect(result.isOk()).toBe(true);
    });

    it("should decode different PNG filter types", () => {
        // Create a minimal PNG structure with custom IDAT data
        const width = 2;
        const height = 2;

        // Filter types for 2 rows: 1 (Sub) and 2 (Up)
        // Row 0 (Sub): [1, 10, 20] -> pixels: [10, 30]
        // Row 1 (Up):  [2, 5, 5]   -> pixels: [10+5=15, 30+5=35]
        const inflated = new Uint8Array([
            1, 10, 20,
            2, 5, 5
        ]);

        const idatData = pako.deflate(inflated);

        const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

        const createChunk = (type: string, data: Uint8Array) => {
            const chunk = new Uint8Array(12 + data.length);
            const view = new DataView(chunk.buffer);

            view.setUint32(0, data.length, false);

            for (let i = 0; i < 4; i++) {
                chunk[4 + i] = type.charCodeAt(i);
            }

            chunk.set(data, 8);

            const crc = CRC32.buf(chunk.subarray(4, 8 + data.length));

            view.setInt32(8 + data.length, crc, false);

            return chunk;
        };

        const ihdr = new Uint8Array(13);
        const ihdrView = new DataView(ihdr.buffer);

        ihdrView.setUint32(0, width, false);
        ihdrView.setUint32(4, height, false);

        ihdr[8] = 8;
        ihdr[9] = 3;

        const palette = new Uint8Array(3 * 256);

        const ihdrChunk = createChunk("IHDR", ihdr);
        const plteChunk = createChunk("PLTE", palette);
        const idatChunk = createChunk("IDAT", idatData);
        const iendChunk = createChunk("IEND", new Uint8Array(0));

        const png = new Uint8Array(
            signature.length +
            ihdrChunk.length +
            plteChunk.length +
            idatChunk.length +
            iendChunk.length
        );

        let pos = 0;
        png.set(signature, pos); pos += signature.length;
        png.set(ihdrChunk, pos); pos += ihdrChunk.length;
        png.set(plteChunk, pos); pos += plteChunk.length;
        png.set(idatChunk, pos); pos += idatChunk.length;
        png.set(iendChunk, pos);

        const result = PNGPaletteImage.fromPngBytes(png);

        expect(result.isOk()).toBe(true);
        const img = result._unsafeUnwrap();

        expect(img.getPixelPaletteIndex(0, 0)._unsafeUnwrap()).toBe(10);
        expect(img.getPixelPaletteIndex(1, 0)._unsafeUnwrap()).toBe(30);
        expect(img.getPixelPaletteIndex(0, 1)._unsafeUnwrap()).toBe(15);
        expect(img.getPixelPaletteIndex(1, 1)._unsafeUnwrap()).toBe(35);
    });
});
