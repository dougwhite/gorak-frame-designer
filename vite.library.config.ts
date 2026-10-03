import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist-library",
    lib: {
      entry: "src/designer.ts",
      formats: ["es"],
      fileName: "gorak-frame-designer",
    },
  },
});
