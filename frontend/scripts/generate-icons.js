import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public')

function createIcon(filename, size) {
  const png = new PNG({ width: size, height: size })
  // Keep the mark within the central safe zone for circular/maskable launchers.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = (size * y + x) << 2
      const dx = Math.abs((x + 0.5) / size - 0.5)
      const dy = Math.abs((y + 0.5) / size - 0.5)
      const isCross = (dx < 0.085 && dy < 0.25) || (dx < 0.25 && dy < 0.085)
      const color = isCross ? [255, 255, 255] : [232, 93, 98]
      png.data[index] = color[0]
      png.data[index + 1] = color[1]
      png.data[index + 2] = color[2]
      png.data[index + 3] = 255
    }
  }
  fs.writeFileSync(path.join(publicDir, filename), PNG.sync.write(png))
  console.log(`Created ${filename} (${size} × ${size})`)
}

createIcon('pwa-192x192.png', 192)
createIcon('pwa-512x512.png', 512)
createIcon('pwa-maskable-512x512.png', 512)
createIcon('apple-touch-icon.png', 180)
