import { extractPages } from './pdfText';
import type { Line } from './types';

/** Lê um PDF no navegador. O pdf.js só é carregado quando o usuário importa algo. */
export async function readPdfInBrowser(data: Uint8Array, password?: string): Promise<Line[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return extractPages(pdfjs as never, data, password);
}
