import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const outDir = path.join(root, 'src', 'generated');
const outFile = path.join(outDir, 'build-info.ts');

const version = process.env.npm_package_version ?? '0.1.0';
let gitHash = 'unknown';
try {
  gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch {
  gitHash = 'unknown';
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, [
  `export const BUILD_VERSION = ${JSON.stringify(version)};`,
  `export const BUILD_GIT_HASH = ${JSON.stringify(gitHash)};`,
  `export const BUILD_TIME = ${JSON.stringify(new Date().toISOString())};`,
  '',
].join('\n'), 'utf-8');
