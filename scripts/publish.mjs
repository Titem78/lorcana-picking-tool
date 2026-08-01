// Publication d'une release GitHub avec le token local du fichier .env.
//
// Usage : npm run publish-release
// Lit GH_TOKEN dans le fichier .env à la racine du projet (non versionné),
// puis lance electron-builder qui construit l'installateur et le publie sur
// GitHub Releases. Le token n'est jamais stocké dans git ni dans Windows.

import { readFileSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')

if (!process.env.GH_TOKEN && existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*GH_TOKEN\s*=\s*(.+?)\s*$/)
    if (m) process.env.GH_TOKEN = m[1]
  }
}

if (!process.env.GH_TOKEN) {
  console.error(
    [
      '❌ Aucun token trouvé.',
      '',
      'Crée un fichier .env à la racine du projet contenant une ligne :',
      '  GH_TOKEN=github_pat_XXXXXXXXXXXX',
      '',
      '(token « fine-grained » limité au dépôt lorcana-picking-tool,',
      ' permission « Contents: Read and write » — voir README)'
    ].join('\n')
  )
  process.exit(1)
}

console.log('🔨 Build + publication de la release GitHub…')
const res = spawnSync('npx', ['electron-builder', '--win', '--publish', 'always'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env
})
process.exit(res.status ?? 1)
