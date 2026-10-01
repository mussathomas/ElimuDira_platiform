import 'server-only';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getSignedDownloadUrl } from '@/lib/storage/r2';

export type FinancePdf = {
  title: string;
  school: { name: string; contact?: string | null; logoPath?: string | null };
  details: [string, string][];
  columns: { label: string; width: number; align?: 'left' | 'right' }[];
  rows: string[][];
};

async function embedSchoolLogo(document: PDFDocument, logoPath?: string | null) {
  if (!logoPath) return null;
  try {
    const url = await getSignedDownloadUrl(logoPath);
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('png') || logoPath.toLowerCase().endsWith('.png')) return document.embedPng(bytes);
    if (contentType.includes('jpeg') || contentType.includes('jpg') || /\.(jpe?g)$/i.test(logoPath)) return document.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

export async function renderFinancePdf(input: FinancePdf) {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedSchoolLogo(document, input.school.logoPath);
  const pageSize: [number, number] = [612, 792];
  const margin = 44;
  const contentWidth = pageSize[0] - margin * 2;
  const rowHeight = 24;
  const detailRows = Math.ceil(input.details.length / 2);
  const tableTop = pageSize[1] - margin - 98 - detailRows * 15 - 12;
  const pageRows = Math.max(1, Math.floor((tableTop - 20 - margin - 35) / rowHeight));
  const pages: { page: ReturnType<typeof document.addPage>; start: number; end: number }[] = [];

  for (let start = 0; start < Math.max(input.rows.length, 1); start += pageRows) {
    const page = document.addPage(pageSize);
    pages.push({ page, start, end: Math.min(start + pageRows, input.rows.length) });
  }

  pages.forEach(({ page, start, end }, pageIndex) => {
    const { height } = page.getSize();
    const brandX = margin + (logo ? 58 : 0);
    page.drawText(input.school.name, { x: brandX, y: height - margin - 16, size: 15, font: bold, color: rgb(0.08, 0.18, 0.2) });
    if (input.school.contact) page.drawText(input.school.contact.slice(0, 110), { x: brandX, y: height - margin - 33, size: 8, font: regular, color: rgb(0.35, 0.4, 0.4) });
    if (logo) {
      const scaled = logo.scaleToFit(48, 48);
      page.drawImage(logo, { x: margin, y: height - margin - scaled.height, width: scaled.width, height: scaled.height });
    }
    page.drawText(input.title, { x: margin, y: height - margin - 77, size: 14, font: bold, color: rgb(0.08, 0.18, 0.2) });

    const detailsTop = height - margin - 98;
    input.details.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + column * (contentWidth / 2);
      const y = detailsTop - row * 15;
      page.drawText(`${label}: ${value}`.slice(0, 95), { x, y, size: 8, font: regular, color: rgb(0.18, 0.22, 0.23) });
    });

    page.drawRectangle({ x: margin, y: tableTop - 20, width: contentWidth, height: 20, color: rgb(0.08, 0.18, 0.2) });
    let columnX = margin + 6;
    input.columns.forEach((column) => {
      const labelWidth = bold.widthOfTextAtSize(column.label, 8);
      const x = column.align === 'right' ? columnX + column.width - labelWidth - 10 : columnX;
      page.drawText(column.label, { x, y: tableTop - 14, size: 8, font: bold, color: rgb(1, 1, 1) });
      columnX += column.width;
    });

    for (let rowIndex = start; rowIndex < end; rowIndex++) {
      const rowY = tableTop - 20 - (rowIndex - start + 1) * rowHeight;
      page.drawLine({ start: { x: margin, y: rowY - 4 }, end: { x: margin + contentWidth, y: rowY - 4 }, thickness: 0.4, color: rgb(0.85, 0.87, 0.87) });
      columnX = margin + 6;
      input.columns.forEach((column, index) => {
        const value = (input.rows[rowIndex]?.[index] ?? '').slice(0, 55);
        const valueWidth = regular.widthOfTextAtSize(value, 8);
        const x = column.align === 'right' ? columnX + column.width - valueWidth - 10 : columnX;
        page.drawText(value, { x, y: rowY + 3, size: 8, font: regular, color: rgb(0.16, 0.2, 0.21) });
        columnX += column.width;
      });
    }
    page.drawText(`${input.title} · ${pageIndex + 1}/${pages.length}`, { x: margin, y: 22, size: 7, font: regular, color: rgb(0.4, 0.44, 0.44) });
  });

  return Buffer.from(await document.save());
}