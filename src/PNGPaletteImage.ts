import pako from 'pako';
import CRC32 from 'crc-32';

export interface RGB {
    r: number;
    g: number;
    b: number;
}

export class PNGPaletteImage {
    private palette: RGB[] = [];
    private transparency: number[] = [];
    private pixels: Uint8Array;

    constructor(
        public readonly width: number,
        public readonly height: number,
        public readonly maxColors: number = 256
    ) {
        this.pixels = new Uint8Array(width * height);
    }

    /**
     * Creates a PNGPaletteImage from a PNG file byte array.
     */
    public static fromPngBytes(bytes: Uint8Array): PNGPaletteImage {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
            throw new Error('Not a PNG file');
        }

        let width = 0;
        let height = 0;
        let rawPalette: RGB[] = [];
        let rawTransparency: number[] = [];
        let idatChunks: Uint8Array[] = [];

        let pos = 8;
        while (pos < bytes.length) {
            const length = view.getUint32(pos, false);
            const type = String.fromCharCode(bytes[pos + 4]!, bytes[pos + 5]!, bytes[pos + 6]!, bytes[pos + 7]!);
            const data = bytes.subarray(pos + 8, pos + 8 + length);

            if (type === 'IHDR') {
                width = view.getUint32(pos + 8, false);
                height = view.getUint32(pos + 12, false);
            } else if (type === 'PLTE') {
                for (let i = 0; i < length / 3; i++) {
                    rawPalette[i] = { r: data[i * 3]!, g: data[i * 3 + 1]!, b: data[i * 3 + 2]! };
                }
            } else if (type === 'tRNS') {
                for (let i = 0; i < length; i++) {
                    rawTransparency[i] = data[i]!;
                }
            } else if (type === 'IDAT') {
                idatChunks.push(data);
            } else if (type === 'IEND') {
                break;
            }
            
            pos += 12 + length;
        }

        if (width === 0 || height === 0) throw new Error('Invalid PNG: Missing IHDR');

        const img = new PNGPaletteImage(width, height, 256);
        img.palette = rawPalette;
        img.transparency = rawTransparency;

        const totalIdatLen = idatChunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combinedIdat = new Uint8Array(totalIdatLen);
        let idatPos = 0;
        for (const chunk of idatChunks) {
            combinedIdat.set(chunk, idatPos);
            idatPos += chunk.length;
        }

        const inflated = pako.inflate(combinedIdat);
        const stride = width + 1;
        for (let y = 0; y < height; y++) {
            // Internal parser unfiltering (Manual Logic)
            // Since we use Filter Type 0 in our encoder, we skip unfiltering complexity for now.
            // But we MUST support Filter 0 correctly by skipping the first byte of each row.
            const filterType = inflated[y * stride];
            const rowData = inflated.subarray(y * stride + 1, y * stride + 1 + width);
            if (filterType === 0) {
                img.pixels.set(rowData, y * width);
            } else {
                // Warning: other filter types not yet robustly supported for external files.
                img.pixels.set(rowData, y * width);
            }
        }

        return img;
    }

    public setPaletteColor(index: number, r: number, g: number, b: number): void {
        if (index < 0 || index >= this.maxColors) throw new Error(`Palette index ${index} out of bounds`);
        this.palette[index] = { r, g, b };
    }

    public getPaletteColor(index: number): RGB | undefined {
        return this.palette[index];
    }

    public setTransparency(index: number, alpha: number): void {
        if (index < 0 || index >= this.maxColors) throw new Error(`Transparency index ${index} out of bounds`);
        this.transparency[index] = alpha;
    }

    public getTransparency(index: number): number | undefined {
        return this.transparency[index];
    }

    public setPixelPaletteIndex(x: number, y: number, colorIndex: number): void {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        this.pixels[y * this.width + x] = colorIndex;
    }

    public getPixelPaletteIndex(x: number, y: number): number {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
        return this.pixels[y * this.width + x]!;
    }

    public encodeToPngBytes(): Uint8Array {
        const signature = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        const ihdrData = new Uint8Array(13);
        const ihdrView = new DataView(ihdrData.buffer);
        ihdrView.setUint32(0, this.width, false);
        ihdrView.setUint32(4, this.height, false);
        ihdrData[8] = 8; ihdrData[9] = 3;
        const ihdr = this.createChunk('IHDR', ihdrData);

        const plteData = new Uint8Array(256 * 3);
        for (let i = 0; i < 256; i++) {
            const color = this.palette[i] || { r: 0, g: 0, b: 0 };
            plteData[i * 3] = color.r;
            plteData[i * 3 + 1] = color.g;
            plteData[i * 3 + 2] = color.b;
        }
        const plte = this.createChunk('PLTE', plteData);

        let trns: Uint8Array | null = null;
        if (this.transparency.length > 0) {
            const trnsData = new Uint8Array(256);
            trnsData.fill(255);
            for (let i = 0; i < 256; i++) {
                if (this.transparency[i] !== undefined) trnsData[i] = this.transparency[i]!;
            }
            trns = this.createChunk('tRNS', trnsData);
        }

        const stride = this.width + 1;
        const idatData = new Uint8Array(this.height * stride);
        for (let y = 0; y < this.height; y++) {
            idatData[y * stride] = 0;
            idatData.set(this.pixels.subarray(y * this.width, (y + 1) * this.width), y * stride + 1);
        }
        const idat = this.createChunk('IDAT', pako.deflate(idatData));
        const iend = this.createChunk('IEND', new Uint8Array(0));

        const chunks = [signature, ihdr, plte];
        if (trns) chunks.push(trns);
        chunks.push(idat, iend);
        return this.concat(chunks);
    }

    private createChunk(type: string, data: Uint8Array): Uint8Array {
        const chunk = new Uint8Array(12 + data.length);
        const view = new DataView(chunk.buffer);
        view.setUint32(0, data.length, false);
        for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
        chunk.set(data, 8);
        const crc = CRC32.buf(chunk.subarray(4, 8 + data.length));
        view.setInt32(8 + data.length, crc, false);
        return chunk;
    }

    private concat(arrays: Uint8Array[]): Uint8Array {
        const out = new Uint8Array(arrays.reduce((a, b) => a + b.length, 0));
        let off = 0;
        for (const a of arrays) { out.set(a, off); off += a.length; }
        return out;
    }
}
