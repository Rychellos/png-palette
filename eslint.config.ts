import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        ignores: ["dist/**"],
    },
    {
        files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
        plugins: { js },
        extends: ["js/recommended"],
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
        rules: {
            "max-lines-per-function": [
                "error",
                { max: 60, skipBlankLines: true },
            ],
        },
    },
    {
        files: ["test/**/*.test.ts"],
        rules: {
            "max-lines-per-function": "off",
        },
    },
    tseslint.configs.recommended,
]);
