/**
 * Reading a spreadsheet into a grid of strings, CSV or XLSX.
 *
 * Hand-rolled rather than pulled from a package. What has to be read here is
 * four columns of text: an xlsx is a zip of XML, the browser can inflate and
 * parse both, and a spreadsheet library is a large dependency with a wide
 * attack surface for a file a manager uploads. The cost is that this reads
 * cell values and nothing else — no formulas, no dates, no formatting —
 * which is all a space list has.
 */

/** A row of cells. Short rows are not padded; callers index defensively. */
export type Grid = string[][];

export class SheetError extends Error {}

/* ------------------------------------------------------------------ zip -- */

interface ZipEntry {
  name: string;
  offset: number;
  compressed: number;
  size: number;
  method: number;
}

function findEOCD(view: DataView): number {
  // The end-of-central-directory record is last, after a comment of up to
  // 64k, so it is found by scanning back for its signature.
  const min = Math.max(0, view.byteLength - 0x10000 - 22);
  for (let i = view.byteLength - 22; i >= min; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  throw new SheetError("That file is not a spreadsheet the importer can read.");
}

function readEntries(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buffer);
  const eocd = findEOCD(view);
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  const out = new Map<string, ZipEntry>();
  const text = new TextDecoder();
  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = text.decode(new Uint8Array(buffer, at + 46, nameLen));
    out.set(name, { name, offset, compressed, size, method });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readFile(
  buffer: ArrayBuffer,
  entry: ZipEntry,
): Promise<string> {
  const view = new DataView(buffer);
  // The local header repeats the name and extra fields at its own lengths.
  const nameLen = view.getUint16(entry.offset + 26, true);
  const extraLen = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLen + extraLen;
  const bytes = new Uint8Array(buffer, start, entry.compressed);

  if (entry.method === 0) return new TextDecoder().decode(bytes);
  if (entry.method !== 8) {
    throw new SheetError("That spreadsheet uses a compression this cannot read.");
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

/* ----------------------------------------------------------------- xlsx -- */

/** "C" -> 2. Cell references carry the column, and rows skip empty cells. */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function readXlsx(file: File): Promise<Grid> {
  const buffer = await file.arrayBuffer();
  const entries = readEntries(buffer);

  const sheetName =
    [...entries.keys()].find((n) => n === "xl/worksheets/sheet1.xml") ??
    [...entries.keys()].find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (!sheetName) {
    throw new SheetError("That spreadsheet has no sheets in it.");
  }

  const parser = new DOMParser();

  let shared: string[] = [];
  const stringsEntry = entries.get("xl/sharedStrings.xml");
  if (stringsEntry) {
    const doc = parser.parseFromString(
      await readFile(buffer, stringsEntry),
      "application/xml",
    );
    shared = [...doc.getElementsByTagName("si")].map((si) =>
      [...si.getElementsByTagName("t")].map((t) => t.textContent ?? "").join(""),
    );
  }

  const doc = parser.parseFromString(
    await readFile(buffer, entries.get(sheetName)!),
    "application/xml",
  );

  const grid: Grid = [];
  for (const row of doc.getElementsByTagName("row")) {
    const cells: string[] = [];
    for (const c of row.getElementsByTagName("c")) {
      const at = columnIndex(c.getAttribute("r") ?? "A");
      const type = c.getAttribute("t");
      let value = "";
      if (type === "inlineStr") {
        value = [...c.getElementsByTagName("t")]
          .map((t) => t.textContent ?? "")
          .join("");
      } else {
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : v;
      }
      while (cells.length < at) cells.push("");
      cells[at] = value;
    }
    grid.push(cells);
  }
  return grid;
}

/* ------------------------------------------------------------------ csv -- */

/** Quoted fields, doubled quotes, and newlines inside quotes. */
export function parseCsv(text: string): Grid {
  const grid: Grid = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      grid.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    grid.push(row);
  }
  return grid;
}

/* ----------------------------------------------------------------- read -- */

export const MAX_SHEET_BYTES = 5 * 1024 * 1024;

export async function readSheet(file: File): Promise<Grid> {
  if (file.size > MAX_SHEET_BYTES) {
    throw new SheetError("That file is over 5 MB.");
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    return parseCsv(await file.text());
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
    return readXlsx(file);
  }
  throw new SheetError("Only CSV and XLSX files can be imported.");
}
