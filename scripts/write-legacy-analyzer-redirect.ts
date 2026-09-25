import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function normalizedBasePath(value: string | undefined): string {
  const raw = value?.trim() || '/';
  const leading = raw.startsWith('/') ? raw : `/${raw}`;
  return leading.endsWith('/') ? leading : `${leading}/`;
}

const base = normalizedBasePath(process.env.KEYDIST_BASE_PATH);
const analyzerUrl = `${base}analyzer`;
const outputPath = resolve('.output/public/legacy.html');
const escapedUrl = analyzerUrl
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0;url=${escapedUrl}" />
    <meta name="robots" content="noindex" />
    <title>keydist Analyzer</title>
  </head>
  <body>
    <p>Analyzer は <a href="${escapedUrl}">${escapedUrl}</a> へ移動しました。</p>
    <script>
      location.replace(${JSON.stringify(analyzerUrl)} + location.search + location.hash);
    </script>
  </body>
</html>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, 'utf8');
