import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * 保存したWorkspaceのURL（`/workspace/<id>`）を、静的配信（GitHub Pages）で直接開けるようにする。
 *
 * idはブラウザに保存した値で、ビルド時には分からないので、URLごとのHTMLは作れない。
 * 代わりにビルドで作る `/workspace/_`（Workspaceの画面をブラウザで描く枠）を `404.html` に複製する。
 * 存在しないURLを開くと配信側が `404.html` を返し、ブラウザがそのURLのまま画面を描く。
 * 開発サーバー・`vite preview` は自前で応答するので、この複製は使わない。
 */
const source = resolve('.output/public/workspace/_/index.html');
const destination = resolve('.output/public/404.html');

await copyFile(source, destination);
