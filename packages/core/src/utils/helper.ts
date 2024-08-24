import fs from 'node:fs';
import fsP from 'node:fs/promises';
import path from 'node:path';
import color from 'picocolors';
import type { ExportEntry, PackageJson, PackageType } from '../types';
import { logger } from './logger';

/**
 * Node.js built-in modules.
 * Copied from https://github.com/webpack/webpack/blob/dd44b206a9c50f4b4cb4d134e1a0bd0387b159a3/lib/node/NodeTargetPlugin.js#L12-L72
 */
export const nodeBuiltInModules: Array<string | RegExp> = [
  'assert',
  'assert/strict',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'dns/promises',
  'domain',
  'events',
  'fs',
  'fs/promises',
  'http',
  'http2',
  'https',
  'inspector',
  'inspector/promises',
  'module',
  'net',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'readline/promises',
  'repl',
  'stream',
  'stream/consumers',
  'stream/promises',
  'stream/web',
  'string_decoder',
  'sys',
  'timers',
  'timers/promises',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'util/types',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
  /^node:/,

  // cspell:word pnpapi
  // Yarn PnP adds pnpapi as "builtin"
  'pnpapi',
];

export async function calcLongestCommonPath(
  absPaths: string[],
): Promise<string | null> {
  if (absPaths.length === 0) {
    return null;
  }

  // we support two cases
  // 1. /packages-a/src/index.ts
  // 2. D:/packages-a/src/index.ts
  const sep = path.posix.sep as '/';

  const splitPaths = absPaths.map((p) => p.split(sep));
  let lcaFragments = splitPaths[0]!;
  for (let i = 1; i < splitPaths.length; i++) {
    const currentPath = splitPaths[i]!;
    const minLength = Math.min(lcaFragments.length, currentPath.length);

    let j = 0;
    while (j < minLength && lcaFragments[j] === currentPath[j]) {
      j++;
    }

    lcaFragments = lcaFragments.slice(0, j);
  }

  let lca = lcaFragments.length > 0 ? lcaFragments.join(sep) : sep;

  const stats = await fsP.stat(lca);
  if (stats?.isFile()) {
    lca = path.dirname(lca);
  }

  return lca;
}

export const readPackageJson = (rootPath: string): undefined | PackageJson => {
  const pkgJsonPath = path.join(rootPath, './package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    logger.warn(`package.json does not exist in the ${rootPath} directory`);
    return;
  }

  try {
    return JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch (err) {
    logger.warn(`Failed to parse ${pkgJsonPath}, it might not be valid JSON`);
    return;
  }
};

export const getExportEntries = (pkgJson: PackageJson): ExportEntry[] => {
  const exportEntriesMap: Record<string, ExportEntry> = {};
  const packageType = pkgJson.type ?? 'commonjs';

  const getFileType = (filePath: string): PackageType => {
    if (filePath.endsWith('.mjs')) {
      return 'module';
    }

    if (filePath.endsWith('.cjs')) {
      return 'commonjs';
    }

    return packageType;
  };

  const addExportPath = (
    exportPathsMap: Record<string, ExportEntry>,
    exportEntry: any,
  ) => {
    exportEntry.outputPath = path.normalize(exportEntry.outputPath);

    const { outputPath: exportPath, type } = exportEntry;

    const existingExportPath = exportPathsMap[exportPath];
    if (existingExportPath) {
      if (existingExportPath.type !== type) {
        throw new Error(
          `Conflicting export types "${existingExportPath.type}" & "${type}" found for ${exportPath}`,
        );
      }

      Object.assign(existingExportPath, exportEntry);
    } else {
      exportPathsMap[exportPath] = exportEntry;
    }
  };

  if (pkgJson.main) {
    const mainPath = pkgJson.main;
    addExportPath(exportEntriesMap, {
      outputPath: mainPath,
      type: getFileType(mainPath),
      from: 'main',
    });
  }

  return Object.values(exportEntriesMap);
};

export const isObject = (obj: unknown): obj is Record<string, any> =>
  Object.prototype.toString.call(obj) === '[object Object]';

export { color };
