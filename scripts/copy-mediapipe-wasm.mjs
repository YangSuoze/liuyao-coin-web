import { constants } from 'node:fs'
import { access, cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const sourceDir = path.join(
  projectRoot,
  'node_modules',
  '@mediapipe',
  'tasks-vision',
  'wasm',
)
const targetDir = path.join(projectRoot, 'public', 'mediapipe-wasm')

async function pathExists(filePath) {
  try {
    await access(filePath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

async function main() {
  const sourceExists = await pathExists(sourceDir)
  if (!sourceExists) {
    console.warn(
      `[postinstall] Skip MediaPipe wasm copy: source folder not found at ${sourceDir}`,
    )
    return
  }

  await mkdir(targetDir, { recursive: true })
  await cp(sourceDir, targetDir, { recursive: true, force: true })
  console.log(
    `[postinstall] Copied MediaPipe wasm assets to public/mediapipe-wasm`,
  )
}

await main()
