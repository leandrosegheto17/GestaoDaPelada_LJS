#!/usr/bin/env node
// Baixa Barlow e Barlow Condensed (woff2, subconjuntos latin e latin-ext) do Google Fonts,
// grava a licença OFL e reescreve fontes.css com @font-face locais.
// Uso: node .md/mockup/fontes/baixar-fontes.mjs   (Node 18+, precisa de internet)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pasta = dirname(fileURLToPath(import.meta.url));
const familias = [
  { nome: "Barlow", pesos: [400, 500, 600, 700] },
  { nome: "Barlow Condensed", pesos: [600, 700, 800] },
];
const subconjuntos = ["latin", "latin-ext"];
const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let css = "/* fontes.css — gerado por baixar-fontes.mjs. Barlow e Barlow Condensed, SIL OFL 1.1 (OFL.txt). */\n";
for (const f of familias) {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.nome)}:wght@${f.pesos.join(";")}&display=swap`;
  const texto = await (await fetch(url, { headers: { "User-Agent": ua } })).text();
  // Blocos: /* latin */ @font-face { ... }
  const blocos = texto.split("/* ").slice(1);
  for (const bloco of blocos) {
    const sub = bloco.slice(0, bloco.indexOf(" */"));
    if (!subconjuntos.includes(sub)) continue;
    const peso = /font-weight:\s*(\d+)/.exec(bloco)[1];
    const origem = /url\((https:[^)]+\.woff2)\)/.exec(bloco)[1];
    const faixa = /unicode-range:\s*([^;]+);/.exec(bloco)[1];
    const arquivo = `${f.nome.replace(/\s+/g, "")}-${peso}-${sub}.woff2`;
    const bin = Buffer.from(await (await fetch(origem)).arrayBuffer());
    writeFileSync(join(pasta, arquivo), bin);
    css += `@font-face{font-family:"${f.nome}";font-style:normal;font-weight:${peso};font-display:swap;src:url("${arquivo}") format("woff2");unicode-range:${faixa};}\n`;
    console.log("ok", arquivo, bin.length, "bytes");
  }
}
const ofl = await (await fetch("https://raw.githubusercontent.com/google/fonts/main/ofl/barlow/OFL.txt")).text();
writeFileSync(join(pasta, "OFL.txt"), ofl);
writeFileSync(join(pasta, "fontes.css"), css);
console.log("fontes.css reescrito com @font-face locais.");
