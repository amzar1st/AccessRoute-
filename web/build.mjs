import { cp, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
await Promise.all(['index.html', 'style.css', 'config.json'].map(file => cp('web/' + file, 'dist/' + file)));
await build({ entryPoints: ['web/app.mjs'], outfile: 'dist/app.js', bundle: true, format: 'esm', target: 'es2022', minify: true });
