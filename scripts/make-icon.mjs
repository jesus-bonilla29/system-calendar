// Genera resources/icon.png (calendario simple) sin dependencias. Uso: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'

const SIZE = 64
const px = Buffer.alloc(SIZE * SIZE * 4)

function set(x, y, [r, g, b, a]) {
  const i = (y * SIZE + x) * 4
  px[i] = r
  px[i + 1] = g
  px[i + 2] = b
  px[i + 3] = a
}

const BLUE = [47, 111, 237, 255]
const DARK = [30, 77, 180, 255]
const WHITE = [255, 255, 255, 255]
const CLEAR = [0, 0, 0, 0]

const inRounded = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), SIZE - 1 - r)
  const cy = Math.min(Math.max(y, r), SIZE - 1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRounded(x, y, 12)) set(x, y, CLEAR)
    else if (y < 18) set(x, y, DARK)
    else set(x, y, BLUE)
  }
}
// Hoja blanca con una cuadrícula de días.
for (let y = 24; y < 54; y++) for (let x = 10; x < 54; x++) set(x, y, WHITE)
for (let row = 0; row < 3; row++) {
  for (let col = 0; col < 4; col++) {
    for (let y = 29 + row * 8; y < 34 + row * 8; y++) {
      for (let x = 14 + col * 10; x < 22 + col * 10; x++) set(x, y, BLUE)
    }
  }
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0
  px.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4)
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // profundidad
ihdr[9] = 6 // RGBA

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])
mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.png', png)
console.log('resources/icon.png', png.length, 'bytes')
