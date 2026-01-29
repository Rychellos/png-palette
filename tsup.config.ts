import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/PNGPaletteImage.ts'],
    clean: true,
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    minify: true
});
