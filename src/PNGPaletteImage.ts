import pako from "pako";
import CRC32 from "crc-32";
import { Result, ok, err } from "neverthrow";

export interface RGBA {
    r: number;
    g: number;
    b: number;
    a: number;
}

export class PNGPaletteImage {
    private palette: Uint8Array;
    private pixels: Uint8Array;

    constructor(
        public readonly width: number,
        public readonly height: number,
        public readonly maxColors: number = 256,
    ) {
        this.pixels = new Uint8Array(width * height);
        this.palette = new Uint8Array(maxColors * 4);

        for (let i = 0; i < maxColors; i++) {
            this.palette[i * 4 + 3] = 255;
        }
    }

    /**
     * Get RGBA palette
     */
    public getPalette(): RGBA[] {
        const palette: RGBA[] = [];

        for (let index = 0; index < this.maxColors; index++) {
            palette[index] = {
                r: this.palette[index * 4]!,
                g: this.palette[index * 4 + 1]!,
                b: this.palette[index * 4 + 2]!,
                a: this.palette[index * 4 + 3]!,
            };
        }

        return palette;
    }

    /**
     * Sets RGBA palette
     */
    public setPalette(newPalette: Uint8Array): Result<void, Error> {
        if (this.palette.length !== newPalette.byteLength) {
            return err(new Error("Invalid length of new color palette"));
        }

        this.palette.set(newPalette);
        return ok(undefined);
    }

    /**
     * Assigns palette from RGBA objects
     */
    public assignPalette(colors: RGBA[]): Result<void, Error> {
        if (colors.length > this.maxColors) {
            return err(
                new Error(
                    `Too many colors: ${colors.length} (max: ${this.maxColors})`,
                ),
            );
        }

        for (let i = 0; i < colors.length; i++) {
            const c = colors[i]!;
            this.palette[i * 4] = c.r;
            this.palette[i * 4 + 1] = c.g;
            this.palette[i * 4 + 2] = c.b;
            this.palette[i * 4 + 3] = c.a;
        }

        return ok(undefined);
    }

    /**
     * Get RGBA image data
     */
    public getImageData(): Uint8Array {
        const imageData = new Uint8Array(this.width * this.height * 4);

        for (let index = 0; index < this.pixels.length; index++) {
            const paletteIndex = this.pixels[index];
            imageData[index * 4] = this.palette[paletteIndex * 4];
            imageData[index * 4 + 1] = this.palette[paletteIndex * 4 + 1];
            imageData[index * 4 + 2] = this.palette[paletteIndex * 4 + 2];
            imageData[index * 4 + 3] = this.palette[paletteIndex * 4 + 3];
        }

        return imageData;
    }

    /**
     * Get raw pixel data, indexes to palette
     */
    public getPixels(): Uint8Array {
        return this.pixels;
    }

    /**
     * Creates a PNGPaletteImage from a PNG file byte array.
     */
    public static fromPngBytes(
        bytes: Uint8Array,
    ): Result<PNGPaletteImage, Error> {
        if (!this.isValidPngSignature(bytes)) {
            return err(new Error("Not a PNG file signature"));
        }

        const parseResult = this.parsePngChunks(bytes);

        if (parseResult.isErr()) {
            return err(parseResult.error);
        }

        const { width, height, palette, imageDataChunks } = parseResult.value;

        const img = new PNGPaletteImage(width, height, 256);
        img.palette = palette;

        return this.decodePngImageData(img, imageDataChunks);
    }

    private static isValidPngSignature(bytes: Uint8Array): boolean {
        return (
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47 &&
            bytes[4] === 0x0d &&
            bytes[5] === 0x0a &&
            bytes[6] === 0x1a &&
            bytes[7] === 0x0a
        );
    }

    private static parsePngChunks(bytes: Uint8Array): Result<{
        width: number;
        height: number;
        palette: Uint8Array;
        imageDataChunks: Uint8Array[];
    }, Error> {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        let width = 0;
        let height = 0;
        let palette: Uint8Array | undefined;
        const imageDataChunks: Uint8Array[] = [];

        let pos = 8;

        while (pos < bytes.length) {
            if (pos + 8 > bytes.length) {
                break;
            }

            const length = view.getUint32(pos, false);
            const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));

            if (pos + 12 + length > bytes.length) {
                return err(new Error(`Chunk ${type} exceeds file bounds`));
            }

            const crcExpected = view.getInt32(pos + 8 + length, false);
            const crcActual = CRC32.buf(bytes.subarray(pos + 4, pos + 8 + length));

            if (crcExpected !== crcActual) {
                return err(new Error(`CRC mismatch in chunk ${type}`));
            }

            const data = bytes.subarray(pos + 8, pos + 8 + length);

            if (type === "IHDR") {
                const res = this.parseIhdr(view, pos);

                if (res.isErr()) {
                    return err(res.error);
                }

                width = res.value.width;
                height = res.value.height;
            } else if (type === "PLTE") {
                palette = this.parsePlte(data);
            } else if (type === "tRNS") {
                if (!palette) {
                    return err(new Error("tRNS before PLTE"));
                }

                for (let i = 0; i < data.length; i++) {
                    palette[i * 4 + 3] = data[i];
                }
            } else if (type === "IDAT") {
                imageDataChunks.push(data);
            } else if (type === "IEND") {
                break;
            }

            pos += 12 + length;
        }

        if (width === 0 || height === 0) {
            return err(new Error("Missing IHDR"));
        }

        if (!palette) {
            return err(new Error("Missing palette"));
        }

        return ok({ width, height, palette, imageDataChunks });
    }

    private static parseIhdr(
        view: DataView,
        pos: number,
    ): Result<{ width: number; height: number }, Error> {
        const width = view.getUint32(pos + 8, false);
        const height = view.getUint32(pos + 12, false);
        const bitDepth = view.getUint8(pos + 16);
        const colorType = view.getUint8(pos + 17);

        if (bitDepth !== 8) {
            return err(new Error(`Unsupported bit depth: ${bitDepth}`));
        }

        if (colorType !== 3) {
            return err(new Error("Only indexed color (3) is supported."));
        }

        return ok({ width, height });
    }

    private static parsePlte(data: Uint8Array): Uint8Array {
        const palette = new Uint8Array(256 * 4);

        for (let i = 0; i < 256; i++) {
            palette[i * 4 + 3] = 255;
        }

        for (let i = 0; i < data.length / 3; i++) {
            palette[i * 4] = data[i * 3];
            palette[i * 4 + 1] = data[i * 3 + 1];
            palette[i * 4 + 2] = data[i * 3 + 2];
        }

        return palette;
    }

    private static decodePngImageData(
        img: PNGPaletteImage,
        imageDataChunks: Uint8Array[],
    ): Result<PNGPaletteImage, Error> {
        const totalLength = imageDataChunks.reduce((acc, c) => acc + c.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;

        for (const chunk of imageDataChunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        let inflated: Uint8Array;

        try {
            inflated = pako.inflate(combined);
        } catch {
            return err(new Error("Failed to decompress IDAT chunks"));
        }

        const stride = img.width + 1;

        if (inflated.length < img.height * stride) {
            return err(new Error("Decompressed data size is too small"));
        }

        for (let y = 0; y < img.height; y++) {
            const filterType = inflated[y * stride]!;
            const rowStart = y * stride + 1;
            const rowData = inflated.subarray(rowStart, rowStart + img.width);
            const prevRowOffset = (y - 1) * img.width;
            const currentRowOffset = y * img.width;

            for (let x = 0; x < img.width; x++) {
                const raw = rowData[x]!;
                const left = x > 0 ? img.pixels[currentRowOffset + x - 1]! : 0;
                const above = y > 0 ? img.pixels[prevRowOffset + x]! : 0;
                const upperLeft = (x > 0 && y > 0) ? img.pixels[prevRowOffset + x - 1]! : 0;

                let val: number;

                switch (filterType) {
                    case 0: val = raw; break;
                    case 1: val = (raw + left) & 0xff; break;
                    case 2: val = (raw + above) & 0xff; break;
                    case 3: val = (raw + Math.floor((left + above) / 2)) & 0xff; break;
                    case 4: val = (raw + this.paethPredictor(left, above, upperLeft)) & 0xff; break;
                    default: return err(new Error(`Unknown filter type: ${filterType}`));
                }
                img.pixels[currentRowOffset + x] = val;
            }
        }

        return ok(img);
    }

    private static paethPredictor(
        left: number,
        above: number,
        upperLeft: number,
    ): number {
        const p = left + above - upperLeft;
        const pLeft = Math.abs(p - left);
        const pAbove = Math.abs(p - above);
        const pUpperLeft = Math.abs(p - upperLeft);

        if (pLeft <= pAbove && pLeft <= pUpperLeft) {
            return left;
        }

        if (pAbove <= pUpperLeft) {
            return above;
        }

        return upperLeft;
    }

    /**
     * Sets color in color palette.
     */
    public setPaletteColor(
        index: number,
        r: number,
        g: number,
        b: number,
        a = 255,
    ): Result<void, Error> {
        if (index < 0 || index >= this.maxColors) {
            return err(new Error(`Palette index ${index} out of bounds`));
        }

        this.palette[index * 4] = r;
        this.palette[index * 4 + 1] = g;
        this.palette[index * 4 + 2] = b;
        this.palette[index * 4 + 3] = a;

        return ok(undefined);
    }

    /**
     * Gets color from color palette.
     */
    public getPaletteColor(index: number): Result<RGBA, Error> {
        if (index < 0 || index >= this.maxColors) {
            return err(new Error(`Palette index ${index} out of bounds`));
        }

        return ok({
            r: this.palette[index * 4]!,
            g: this.palette[index * 4 + 1]!,
            b: this.palette[index * 4 + 2]!,
            a: this.palette[index * 4 + 3]!,
        });
    }

    /**
     * Sets color index at image's x & y.
     */
    public setPixelPaletteIndex(
        x: number,
        y: number,
        colorIndex: number,
    ): Result<void, Error> {
        if (colorIndex < 0 || colorIndex >= this.maxColors) {
            return err(new Error(`Palette index ${colorIndex} out of bounds`));
        }

        if (x < 0 || x >= this.width) {
            return err(new Error(`X index ${x} out of bounds`));
        }

        if (y < 0 || y >= this.height) {
            return err(new Error(`Y index ${y} out of bounds`));
        }

        this.pixels[y * this.width + x] = colorIndex;

        return ok(undefined);
    }

    /**
     * Gets color index at image's x & y.
     */
    public getPixelPaletteIndex(x: number, y: number): Result<number, Error> {
        if (x < 0 || x >= this.width) {
            return err(new Error(`X index ${x} out of bounds`));
        }

        if (y < 0 || y >= this.height) {
            return err(new Error(`Y index ${y} out of bounds`));
        }

        return ok(this.pixels[y * this.width + x]!);
    }

    /**
     * Returns encoded png bytes
     */
    public encodeToPngBytes(): Uint8Array {
        const signature = new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);

        const headerData = new Uint8Array(13);
        const headerView = new DataView(headerData.buffer);
        headerView.setUint32(0, this.width, false);
        headerView.setUint32(4, this.height, false);
        headerData[8] = 8;
        headerData[9] = 3; // Color type 3 (indexed)
        headerData[10] = 0; // Compression
        headerData[11] = 0; // Filter
        headerData[12] = 0; // Interlace
        const headerChunk = this.createChunk("IHDR", headerData);

        const paletteData = new Uint8Array(this.maxColors * 3);
        const transparencyData = new Uint8Array(this.maxColors);

        for (let i = 0; i < this.maxColors; i++) {
            paletteData[i * 3] = this.palette[i * 4];
            paletteData[i * 3 + 1] = this.palette[i * 4 + 1];
            paletteData[i * 3 + 2] = this.palette[i * 4 + 2];
            transparencyData[i] = this.palette[i * 4 + 3];
        }

        const paletteChunk = this.createChunk("PLTE", paletteData);
        const transparencyChunk = this.createChunk("tRNS", transparencyData);

        const stride = this.width + 1;
        const imageDataChunkData = new Uint8Array(this.height * stride);

        for (let y = 0; y < this.height; y++) {
            imageDataChunkData[y * stride] = 0; // Filter 0 (None) for encoding
            imageDataChunkData.set(
                this.pixels.subarray(y * this.width, (y + 1) * this.width),
                y * stride + 1,
            );
        }

        const imageDataChunk = this.createChunk(
            "IDAT",
            pako.deflate(imageDataChunkData),
        );

        const imageTrailerChunk = this.createChunk("IEND", new Uint8Array(0));

        return this.concat([
            signature,
            headerChunk,
            paletteChunk,
            transparencyChunk,
            imageDataChunk,
            imageTrailerChunk,
        ]);
    }

    /**
     * Creates a palette image from RGBA bytes.
     */
    public static fromRgbaBytes(
        rgba: Uint8Array,
        width: number,
        height: number,
        options: { quantize?: boolean } = {},
    ): Result<PNGPaletteImage, Error> {
        if (rgba.length !== width * height * 4) {
            return err(new Error("Invalid RGBA buffer length"));
        }

        const colorsMap = new Map<number, number>();
        const paletteColors: RGBA[] = [];
        const pixelIndices = new Uint8Array(width * height);

        for (let i = 0; i < width * height; i++) {
            const r = rgba[i * 4]!;
            const g = rgba[i * 4 + 1]!;
            const b = rgba[i * 4 + 2]!;
            const a = rgba[i * 4 + 3]!;

            // pack to 32bit int for map key
            const packed = (r << 24) | (g << 16) | (b << 8) | a;

            if (!colorsMap.has(packed)) {
                if (paletteColors.length >= 256) {
                    if (options.quantize) {
                        // Simple "quantization": map to closest existing color
                        let bestIndex = 0;
                        let minDistance = Infinity;

                        for (let j = 0; j < paletteColors.length; j++) {
                            const p = paletteColors[j]!;
                            const dist = Math.pow(r - p.r, 2) + Math.pow(g - p.g, 2) + Math.pow(b - p.b, 2) + Math.pow(a - p.a, 2);

                            if (dist < minDistance) {
                                minDistance = dist;
                                bestIndex = j;
                            }
                        }

                        pixelIndices[i] = bestIndex;

                        continue;
                    } else {
                        return err(
                            new Error(
                                `Image has too many unique colors (${paletteColors.length + 1} > 256). Try enabling the 'quantize' flag.`,
                            ),
                        );
                    }
                }

                const index = paletteColors.length;
                colorsMap.set(packed, index);
                paletteColors.push({ r, g, b, a });
                pixelIndices[i] = index;
            } else {
                pixelIndices[i] = colorsMap.get(packed)!;
            }
        }

        const img = new PNGPaletteImage(width, height, 256);
        const assignResult = img.assignPalette(paletteColors);
        if (assignResult.isErr()) {
            return err(assignResult.error);
        }

        img.pixels.set(pixelIndices);

        return ok(img);
    }

    private createChunk(type: string, data: Uint8Array): Uint8Array {
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
    }

    private concat(arrays: Uint8Array[]): Uint8Array {
        const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;

        for (const arr of arrays) {
            result.set(arr, offset);
            offset += arr.length;
        }

        return result;
    }
}
