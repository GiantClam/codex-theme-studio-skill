const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint32be(bytes, offset) {
  return bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function uint16be(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function dimensions(mime, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("image dimensions are invalid");
  return { mime, width, height };
}

function parsePng(bytes) {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR" || uint32be(bytes, 8) !== 13) throw new Error("PNG header is invalid");
  return dimensions("image/png", uint32be(bytes, 16), uint32be(bytes, 20));
}

function parseJpeg(bytes) {
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error("JPEG marker is invalid");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || marker === 0xd7 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = uint16be(bytes, offset);
    if (length < 2 || offset + length > bytes.length) throw new Error("JPEG header is truncated");
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return dimensions("image/jpeg", uint16be(bytes, offset + 5), uint16be(bytes, offset + 3));
    }
    offset += length;
  }
  throw new Error("JPEG dimensions are missing");
}

function parseWebp(bytes) {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") throw new Error("WebP header is invalid");
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X" && bytes.length >= 30) return dimensions("image/webp", 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16));
  if (chunk === "VP8 " && bytes.length >= 30) return dimensions("image/webp", bytes[26] | (bytes[27] << 8), bytes[28] | (bytes[29] << 8));
  throw new Error("WebP dimensions are missing");
}

export function validateImageMetadata(bytes, { expectedMime } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > 8 * 1024 * 1024) throw new Error("image must be a non-empty file below 8 MB");
  const metadata = PNG.every((value, index) => bytes[index] === value)
    ? parsePng(bytes)
    : bytes[0] === 0xff && bytes[1] === 0xd8
      ? parseJpeg(bytes)
      : ascii(bytes, 0, 4) === "RIFF"
        ? parseWebp(bytes)
        : null;
  if (!metadata) throw new Error("unsupported image format");
  if (expectedMime && metadata.mime !== expectedMime) throw new Error(`image MIME does not match extension: expected ${expectedMime}, got ${metadata.mime}`);
  if (metadata.width > 8192 || metadata.height > 8192 || metadata.width * metadata.height > 32_000_000) throw new Error("image dimensions exceed limits");
  return metadata;
}
