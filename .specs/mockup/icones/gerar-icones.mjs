#!/usr/bin/env node
// Confere que as cores do ícone existem em tokens.css e gera os PNG com o Chrome headless instalado.
// Uso: node .md/mockup/icones/gerar-icones.mjs            (gera os 4 PNG a partir de icone.svg)
//      node .md/mockup/icones/gerar-icones.mjs --verificar caminho.svg   (só confere as cores)
// Saída: 0 ok; 1 cor fora dos tokens; 2 Chrome ausente ou falha ao gerar (nenhum PNG parcial é gravado).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const pasta = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(pasta, "..", "tokens.css"), "utf8").toUpperCase();
const saidas = [
  ["icone-192.png", 192],
  ["icone-512.png", 512],
  ["icone-512-maskable.png", 512],
  ["apple-touch-180.png", 180],
];

function coresForaDosTokens(svg) {
  const cores = new Set(svg.match(/#[0-9A-Fa-f]{6}\b/g)?.map((c) => c.toUpperCase()));
  return [...cores].filter((c) => !tokens.includes(c));
}

function achaChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidatos.find((c) => c && existsSync(c));
}

const verificar = process.argv[2] === "--verificar";
const origem = verificar ? resolve(process.argv[3]) : join(pasta, "icone.svg");
const fora = coresForaDosTokens(readFileSync(origem, "utf8"));
if (fora.length) {
  console.error(`Cor fora de tokens.css em ${origem}: ${fora.join(", ")}`);
  process.exit(1);
}
console.log("Cores do SVG conferidas contra tokens.css.");
if (verificar) process.exit(0);

const chrome = achaChrome();
if (!chrome) {
  console.error("Chrome não encontrado (defina CHROME_PATH). Nenhum PNG foi gerado.");
  process.exit(2);
}
const tmp = mkdtempSync(join(tmpdir(), "icones-"));
try {
  for (const [arquivo, n] of saidas) {
    execFileSync(chrome, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", `--force-device-scale-factor=${n / 512}`,
      `--user-data-dir=${join(tmp, "perfil")}`, `--screenshot=${join(tmp, arquivo)}`,
      "--window-size=512,512", "--default-background-color=00000000", pathToFileURL(origem).href,
    ], { stdio: ["ignore", "ignore", "inherit"], timeout: 60000 });
    if (!existsSync(join(tmp, arquivo))) throw new Error(`Chrome não gerou ${arquivo}`);
  }
  for (const [arquivo] of saidas) copyFileSync(join(tmp, arquivo), join(pasta, arquivo));
  for (const [arquivo, n] of saidas) console.log("ok", arquivo, `${n}x${n}`);
} catch (e) {
  console.error("Falha ao gerar PNG:", e.message);
  process.exit(2);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
