require("esbuild").build({
    entryPoints: ["./src/script.ts"],
    bundle: true,
    sourcemap: true,
    target: 'es6',
    format: 'esm',
    minify: true,
    loader: { ".ts": "ts" },
    outfile: "./build/script.js"
})
    .then(() => console.log("⚡ Build Done"))
    .catch(() => process.exit(1));