import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fromFile } from "geotiff";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "public", "generated");
const requestedYear = process.argv[2] ?? "2023";
const inputFilename = `uso_suelo_${requestedYear}_reserva_chore.tif`;
const outputBaseName = `uso_suelo_${requestedYear}_preview`;
const inputPath = path.join(rootDir, "public", "data", inputFilename);
const outputPngPath = path.join(outputDir, `${outputBaseName}.png`);
const outputMetaPath = path.join(outputDir, `${outputBaseName}.json`);

const CLASS_COLORS = {
  0: null,
  1: [14, 91, 116, 255],
  3: [31, 143, 69, 255],
  4: [78, 168, 90, 255],
  5: [43, 147, 79, 255],
  9: [216, 190, 106, 255],
  10: [216, 190, 106, 255],
  11: [195, 169, 93, 255],
  12: [216, 190, 106, 255],
  13: [234, 211, 155, 255],
  15: [234, 122, 255, 255],
  18: [216, 78, 212, 255],
  21: [239, 159, 76, 255],
  23: [176, 183, 191, 255],
  24: [45, 126, 247, 255],
  25: [229, 213, 170, 255],
  29: [34, 181, 115, 255],
  30: [239, 159, 76, 255],
  33: [91, 141, 249, 255],
  39: [14, 91, 116, 255],
  41: [147, 191, 100, 255],
  49: [194, 148, 255, 255],
  50: [30, 127, 206, 255],
  62: [138, 143, 148, 255]
};

const MAX_WIDTH = 1400;

const pickColor = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return [0, 0, 0, 0];
  }

  return CLASS_COLORS[numericValue] || [14, 91, 116, 255];
};

const main = async () => {
  await mkdir(outputDir, { recursive: true });

  const tiff = await fromFile(inputPath);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const scale = width > MAX_WIDTH ? width / MAX_WIDTH : 1;
  const targetWidth = Math.max(1, Math.round(width / scale));
  const targetHeight = Math.max(1, Math.round(height / scale));

  const [raster] = await image.readRasters({ interleave: false });
  const png = new PNG({ width: targetWidth, height: targetHeight });

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(y * scale));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x * scale));
      const value = raster[sourceY * width + sourceX];
      const [red, green, blue, alpha] = pickColor(value);
      const index = (y * targetWidth + x) * 4;
      png.data[index] = red;
      png.data[index + 1] = green;
      png.data[index + 2] = blue;
      png.data[index + 3] = alpha;
    }
  }

  const pngBuffer = PNG.sync.write(png);
  await writeFile(outputPngPath, pngBuffer);

  const metadata = {
    year: Number(requestedYear),
    source: inputFilename,
    preview: `${outputBaseName}.png`,
    original: { width, height },
    previewSize: { width: targetWidth, height: targetHeight },
    bounds: image.getBoundingBox(),
    generatedAt: new Date().toISOString()
  };

  await writeFile(outputMetaPath, `${JSON.stringify(metadata, null, 2)}\n`);

  console.log(
    `Preview generado: ${path.relative(rootDir, outputPngPath)} (${targetWidth}x${targetHeight})`
  );
};

main().catch((error) => {
  console.error(`No se pudo generar el preview del raster ${requestedYear}.`);
  console.error(error);
  process.exitCode = 1;
});
