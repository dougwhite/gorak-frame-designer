import { defineConfig } from "vite";
import { relative } from "node:path";
export default defineConfig({
  plugins: [
    {
      name: "library-release-inventory",
      generateBundle(_options, bundle) {
        for (const item of Object.values(bundle)) {
          if (
            item.type === "chunk" &&
            (item.imports.length || item.dynamicImports.length)
          )
            this.error(
              "Release library must be self-contained; review runtime imports",
            );
        }
        const modules = Object.values(bundle).flatMap((item) =>
          item.type === "chunk" ? Object.keys(item.modules) : [],
        );
        this.emitFile({
          type: "asset",
          fileName: "release-inventory.json",
          source: JSON.stringify(
            {
              modules: modules
                .map((id) => relative(process.cwd(), id).replaceAll("\\", "/"))
                .sort(),
              files: Object.keys(bundle).sort(),
            },
            null,
            2,
          ),
        });
      },
    },
  ],
  build: {
    outDir: "dist-library",
    lib: {
      entry: "src/designer.ts",
      formats: ["es"],
      fileName: "gorak-frame-designer",
    },
  },
});
