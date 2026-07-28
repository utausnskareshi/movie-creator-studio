// Generates build/icon.ico (256px PNG-in-ICO) with zero dependencies.
// Design: deep-navy rounded square, indigo->violet diagonal gradient bar,
// white play triangle with film-strip sprocket holes on the left edge.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const S = 256

function px() {
  const buf = new Uint8Array(S * S * 4)
  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * S + x) * 4
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = a
  }
  const inRounded = (x, y, r) => {
    const lo = r
    const hi = S - 1 - r
    const cx = Math.min(Math.max(x, lo), hi)
    const cy = Math.min(Math.max(y, lo), hi)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inRounded(x, y, 44)) continue
      // background: vertical navy gradient
      const t = y / S
      let r = 12 + 10 * t
      let g = 16 + 14 * t
      let b = 30 + 34 * t
      // diagonal accent gradient band across the lower-right
      const d = (x + y) / (2 * S)
      if (d > 0.55) {
        const k = Math.min(1, (d - 0.55) / 0.45)
        r = r * (1 - k) + (109 + (159 - 109) * k) * k
        g = g * (1 - k) + (109 * (1 - k) + 109 * k) * k * 0.9
        b = b * (1 - k) + 255 * k
      }
      set(x, y, r | 0, g | 0, b | 0)
    }
  }
  // film sprocket holes (left column)
  for (let hy = 0; hy < 5; hy++) {
    const cy = 44 + hy * 42
    for (let y = cy; y < cy + 22; y++) {
      for (let x = 26; x < 48; x++) {
        if (!inRounded(x, y, 44)) continue
        const rx = (x - 37) / 11
        const ry = (y - (cy + 11)) / 11
        if (rx * rx + ry * ry <= 1) set(x, y, 226, 232, 245)
      }
    }
  }
  // play triangle
  const tipX = 208
  const leftX = 92
  const topY = 62
  const botY = 194
  const midY = (topY + botY) / 2
  for (let y = topY; y <= botY; y++) {
    const k = 1 - Math.abs(y - midY) / (midY - topY)
    const xe = leftX + (tipX - leftX) * k
    for (let x = leftX; x <= xe; x++) {
      if (inRounded(x, y, 44)) set(x, y, 255, 255, 255)
    }
  }
  return buf
}

function crc32(bytes) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of bytes) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeB = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeB, data])))
  return Buffer.concat([len, typeB, data, crc])
}

function encodePng(rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(S, 0)
  ihdr.writeUInt32BE(S, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(S * (S * 4 + 1))
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0 // filter none
    Buffer.from(rgba.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const png = encodePng(px())
// ICO: header + 1 dir entry + png payload
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2) // type icon
header.writeUInt16LE(1, 4) // count
const entry = Buffer.alloc(16)
entry[0] = 0 // 256px
entry[1] = 0
entry[4] = 1 // planes
entry.writeUInt16LE(32, 6) // bpp
entry.writeUInt32LE(png.length, 8)
entry.writeUInt32LE(6 + 16, 12)
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.ico', Buffer.concat([header, entry, png]))
console.log(`build/icon.ico written (${png.length} bytes png payload)`)
