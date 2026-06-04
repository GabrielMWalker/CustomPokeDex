import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflate } from 'node:zlib';
import { promisify } from 'node:util';

const zip = promisify(deflate);
const root = path.resolve(import.meta.dirname, '..');
const iconDir = path.join(root, 'src-tauri', 'icons');
const width = 256;
const height = 256;
const rgba = Buffer.alloc(width * height * 4);

function setPixel(x, y, r, g, b, a = 255) {
  const i = (y * width + x) * 4;
  rgba[i] = r;
  rgba[i + 1] = g;
  rgba[i + 2] = b;
  rgba[i + 3] = a;
}

function fillCircle(cx, cy, radius, color) {
  const [r, g, b, a = 255] = color;
  const radiusSquared = radius * radius;
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radiusSquared) {
        setPixel(x, y, r, g, b, a);
      }
    }
  }
}

function fillRect(x0, y0, x1, y1, color) {
  const [r, g, b, a = 255] = color;
  for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
    for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
      setPixel(x, y, r, g, b, a);
    }
  }
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

async function createPng(pngWidth, pngHeight, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pngWidth, 0);
  ihdr.writeUInt32BE(pngHeight, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const raw = Buffer.alloc((pngWidth * 4 + 1) * pngHeight);
  for (let y = 0; y < pngHeight; y += 1) {
    raw[y * (pngWidth * 4 + 1)] = 0;
    pixels.copy(raw, y * (pngWidth * 4 + 1) + 1, y * pngWidth * 4, (y + 1) * pngWidth * 4);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', await zip(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length + images.length * 16;
  const directories = images.map(image => {
    const directory = Buffer.alloc(16);
    directory[0] = image.size >= 256 ? 0 : image.size;
    directory[1] = image.size >= 256 ? 0 : image.size;
    directory[2] = 0;
    directory[3] = 0;
    directory.writeUInt16LE(1, 4);
    directory.writeUInt16LE(32, 6);
    directory.writeUInt32LE(image.png.length, 8);
    directory.writeUInt32LE(offset, 12);
    offset += image.png.length;
    return directory;
  });

  return Buffer.concat([header, ...directories, ...images.map(image => image.png)]);
}

function resizeRgba(targetSize) {
  if (targetSize === width) return Buffer.from(rgba);
  const resized = Buffer.alloc(targetSize * targetSize * 4);
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x * width / targetSize));
      const sourceY = Math.min(height - 1, Math.floor(y * height / targetSize));
      const sourceIndex = (sourceY * width + sourceX) * 4;
      const targetIndex = (y * targetSize + x) * 4;
      rgba.copy(resized, targetIndex, sourceIndex, sourceIndex + 4);
    }
  }
  return resized;
}

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    setPixel(x, y, 0, 0, 0, 0);
  }
}

fillRect(8, 8, 248, 248, [24, 30, 42]);
fillRect(18, 18, 238, 121, [224, 45, 58]);
fillRect(18, 135, 238, 238, [246, 248, 250]);
fillRect(18, 121, 238, 135, [24, 30, 42]);

fillRect(28, 28, 228, 44, [236, 78, 88, 210]);
fillRect(28, 212, 228, 228, [217, 226, 232, 190]);
fillRect(18, 18, 238, 26, [255, 255, 255, 52]);

fillCircle(128, 128, 45, [24, 30, 42]);
fillCircle(128, 128, 31, [246, 248, 250]);
fillCircle(128, 128, 18, [209, 219, 226]);
fillCircle(118, 118, 8, [255, 255, 255, 160]);

fillRect(8, 8, 248, 16, [45, 53, 68]);
fillRect(8, 240, 248, 248, [10, 14, 22]);
fillRect(8, 8, 16, 248, [45, 53, 68]);
fillRect(240, 8, 248, 248, [10, 14, 22]);

await mkdir(iconDir, { recursive: true });
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(iconSizes.map(async size => ({
  size,
  png: await createPng(size, size, resizeRgba(size)),
})));
const fullSizePng = images.find(image => image.size === 256).png;
await writeFile(path.join(iconDir, 'icon.png'), fullSizePng);
await writeFile(path.join(iconDir, '32x32.png'), images.find(image => image.size === 32).png);
await writeFile(path.join(iconDir, '128x128.png'), images.find(image => image.size === 128).png);
await writeFile(path.join(iconDir, '128x128@2x.png'), fullSizePng);
await writeFile(path.join(iconDir, 'icon.ico'), createIco(images));

console.log('Generated multi-size src-tauri/icons/icon.ico');
