import type { Ignore } from 'ignore'
import path from 'path'
import fs from 'fs'

// ignore module uses .default in its CJS export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createIgnore: () => Ignore = require('ignore').default ?? require('ignore')

const DEFAULT_PATTERNS = [
  'node_modules',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  '*.log',
  '.env',
  '.env.*',
  'dist',
  'build',
  '__pycache__',
  '*.pyc',
  '.deployignore'
]

export function createIgnoreFilter(
  localPath: string,
  extraPatterns: string[] = []
): Ignore {
  const ig = createIgnore()

  ig.add(DEFAULT_PATTERNS)

  if (extraPatterns.length > 0) {
    ig.add(extraPatterns)
  }

  const deployIgnorePath = path.join(localPath, '.deployignore')
  if (fs.existsSync(deployIgnorePath)) {
    ig.add(fs.readFileSync(deployIgnorePath, 'utf8'))
  }

  const gitIgnorePath = path.join(localPath, '.gitignore')
  if (fs.existsSync(gitIgnorePath)) {
    ig.add(fs.readFileSync(gitIgnorePath, 'utf8'))
  }

  return ig
}

export function isIgnored(ig: Ignore, relativePath: string): boolean {
  return ig.ignores(relativePath.replace(/\\/g, '/'))
}
