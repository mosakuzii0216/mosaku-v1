// Simple PNG generator for solid color icons without external deps (CommonJS)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
	let c = ~0;
	for (let i = 0; i < buf.length; i++) {
		c ^= buf[i];
		for (let k = 0; k < 8; k++) {
			c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
		}
	}
	return ~c >>> 0;
}

function u32(n) {
	const b = Buffer.alloc(4);
	b.writeUInt32BE(n >>> 0, 0);
	return b;
}

function chunk(type, data) {
	const t = Buffer.from(type, 'ascii');
	const len = u32(data.length);
	const crc = u32(crc32(Buffer.concat([t, data])));
	return Buffer.concat([len, t, data, crc]);
}

function makePng(width, height, rgba) {
	const row = Buffer.alloc(1 + width * 4);
	row[0] = 0;
	for (let x = 0; x < width; x++) {
		const o = 1 + x * 4;
		row[o + 0] = rgba[0];
		row[o + 1] = rgba[1];
		row[o + 2] = rgba[2];
		row[o + 3] = rgba[3];
	}
	const raw = Buffer.alloc((1 + width * 4) * height);
	for (let y = 0; y < height; y++) row.copy(raw, y * row.length);

	const idat = zlib.deflateSync(raw, { level: 9 });

	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	return Buffer.concat([
		signature,
		chunk('IHDR', ihdr),
		chunk('IDAT', idat),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function writeIcon(name, size, color) {
	const outDir = path.join(__dirname, '..', 'public');
	ensureDir(outDir);
	const png = makePng(size, size, color);
	const outPath = path.join(outDir, name);
	fs.writeFileSync(outPath, png);
	console.log('wrote', outPath, png.length, 'bytes');
}

const blue = [33, 150, 243, 255];
const gray = [245, 247, 250, 255];

writeIcon('icon-192x192.png', 192, blue);
writeIcon('icon-512x512.png', 512, blue);
writeIcon('maskable-icon-512x512.png', 512, blue);
writeIcon('apple-touch-icon.png', 180, gray);
