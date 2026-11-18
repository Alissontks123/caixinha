/** Mostra as linhas de um PDF com a posição x de cada pedaço. Uso: node scripts/dump-pdf.mjs arquivo.pdf [senha] */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'node:fs';
const [, , file, password] = process.argv;
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), password }).promise;
for (let p = 1; p <= doc.numPages; p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  const rows = new Map();
  for (const it of tc.items) {
    if (!it.str?.trim()) continue;
    const y = Math.round(it.transform[5]);
    const k = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push({ x: Math.round(it.transform[4]), s: it.str });
  }
  console.log(`=== PAGE ${p} ===`);
  for (const y of [...rows.keys()].sort((a, b) => b - a)) {
    console.log(rows.get(y).sort((a, b) => a.x - b.x).map((i) => `[${i.x}]${i.s}`).join(' '));
  }
}
