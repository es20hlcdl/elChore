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
const outputBaseName = `uso_suelo_${requestedYear}_pressure_mask`;
const inputPath = path.join(rootDir, "public", "data", inputFilename);
const outputPngPath = path.join(outputDir, `${outputBaseName}.png`);

const HIGHLIGHT_CLASSES = new Set([15, 18, 49]);
const MAX_WIDTH = 1400;

const pickColor = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || !HIGHLIGHT_CLASSES.has(numericValue)) {
    return [0, 0, 0, 0];
  }

  return [255, 0, 0, 255];
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

  console.log(
    `Mascara generada: ${path.relative(rootDir, outputPngPath)} (${targetWidth}x${targetHeight})`
  );
};

main().catch((error) => {
  console.error(`No se pudo generar la mascara del raster ${requestedYear}.`);
  console.error(error);
  process.exitCode = 1;
});
