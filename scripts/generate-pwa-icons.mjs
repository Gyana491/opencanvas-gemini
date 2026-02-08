#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const inputLogoPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(projectRoot, "public", "logo.png");
const outputDir = path.join(projectRoot, "public", "pwa");

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error(
    "The 'sharp' package is required to generate PWA icons. Install it with: npm install --save-dev sharp",
  );
  process.exit(1);
}

const iconSizes = [72, 96, 128, 144, 152, 167, 180, 192, 384, 512];
const faviconSizes = [16, 32];
const baseBackground = { r: 15, g: 23, b: 42, alpha: 1 };

async function ensureInputExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    console.error(`Logo not found at: ${filePath}`);
    process.exit(1);
  }
}

async function generateSquareIcon(size) {
  await sharp(inputLogoPath)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(path.join(outputDir, `icon-${size}x${size}.png`));
}

async function generateMaskableIcon(size) {
  const innerSize = Math.round(size * 0.8);
  const foreground = await sharp(inputLogoPath)
    .resize(innerSize, innerSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: baseBackground,
    },
  })
    .composite([{ input: foreground, gravity: "center" }])
    .png()
    .toFile(path.join(outputDir, `icon-maskable-${size}x${size}.png`));
}

async function generateAppleTouchIcon() {
  await fs.copyFile(
    path.join(outputDir, "icon-180x180.png"),
    path.join(outputDir, "apple-touch-icon.png"),
  );
}

async function generateFavicons() {
  for (const size of faviconSizes) {
    await sharp(inputLogoPath)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(outputDir, `favicon-${size}x${size}.png`));
  }
}

async function main() {
  await ensureInputExists(inputLogoPath);
  await fs.mkdir(outputDir, { recursive: true });

  for (const size of iconSizes) {
    await generateSquareIcon(size);
  }

  await generateMaskableIcon(192);
  await generateMaskableIcon(512);
  await generateAppleTouchIcon();
  await generateFavicons();

  console.log(`PWA icons generated from ${inputLogoPath}`);
  console.log(`Output directory: ${outputDir}`);
}

main().catch((error) => {
  console.error("Failed to generate PWA icons:", error);
  process.exit(1);
});
