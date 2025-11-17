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

// Try to read color from favicon.svg so icons match its color
function parseHexToRgba(hex) {
	if (!hex) return null;
	const m = hex.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
	if (!m) return null;
	let h = m[1];
	if (h.length === 3) {
		h = h
			.split('')
			.map((c) => c + c)
			.join('');
	}
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return [r, g, b, 255];
}

function faviconColor() {
	try {
		const svgPath = path.join(__dirname, '..', 'public', 'favicon.svg');
		const svg = fs.readFileSync(svgPath, 'utf8');
		// Pick the first hex color like #RRGGBB or #RGB
		const match = svg.match(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/);
		return parseHexToRgba(match ? `#${match[1]}` : null);
	} catch (_) {
		return null;
	}
}

// Force target color to #00582d as requested
const base = parseHexToRgba('#00582d');

// Generate icons using the specified color
writeIcon('icon-192x192.png', 192, base);
writeIcon('icon-512x512.png', 512, base);
// Keep maskable consistent as well
writeIcon('maskable-icon-512x512.png', 512, base);
writeIcon('apple-touch-icon.png', 180, base);
