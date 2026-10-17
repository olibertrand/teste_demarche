// Construit dist/demarche.html : un seul fichier autonome (CSS et JavaScript intégrés),
// qui s'ouvre d'un double-clic, sans serveur ni connexion (seules les polices viennent d'Internet).
//
//   npm run build                          → dist/demarche.html
//   npm run build -- --fragment chemin     → produit aussi un fragment sans <html>/<head>/<body>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const html = read('index.html');
function between(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0) throw new Error(`repère ${start} introuvable dans index.html`);
  return html.slice(a + start.length, b).trim();
}

const head = between('<!-- HEAD:START -->', '<!-- HEAD:END -->');
const app = between('<!-- APP:START -->', '<!-- APP:END -->');
const css = read('src/style.css');
const bundle = await build({
  entryPoints: [join(root, 'src/ui/app.js')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
  legalComments: 'none',
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
<style>
${css}</style>
</head>
<body>
${app}
<script>
${js}</script>
</body>
</html>
`;

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/demarche.html'), page);
console.log(`dist/demarche.html : ${(page.length / 1024).toFixed(0)} Ko`);

const k = process.argv.indexOf('--fragment');
if (k > 0 && process.argv[k + 1]) {
  writeFileSync(process.argv[k + 1], `${head}\n<style>\n${css}</style>\n${app}\n<script>\n${js}</script>\n`);
  console.log(`fragment : ${process.argv[k + 1]}`);
}
