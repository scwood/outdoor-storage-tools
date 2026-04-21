import { useState } from "react";
import { Alert, Button, Group, Stack, Table, Text, Title } from "@mantine/core";
import { Dropzone, MS_EXCEL_MIME_TYPE } from "@mantine/dropzone";
import * as XLSX from "xlsx";

type Row = {
  date: string;
  chargeTotal: number;
  depositTotal: number;
};

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (raw == null) return 0;
  const s = String(raw).replace(/[$,\s]/g, "");
  if (!s) return 0;
  // Support accounting-style parentheses negatives: (1.23) → -1.23
  const normalized =
    s.startsWith("(") && s.endsWith(")") ? "-" + s.slice(1, -1) : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function parseProcessedDate(raw: unknown): string | null {
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s+/g, " ");
  // Expect "Mar 2 2026" style.
  const match = s.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (!match) return null;
  const mm = MONTHS[match[1].toLowerCase()];
  if (!mm) return null;
  const dd = match[2].padStart(2, "0");
  return `${match[3]}-${mm}-${dd}`;
}

function summarize(rows: Record<string, unknown>[]): {
  rows: Row[];
  skipped: number;
} {
  const byDate = new Map<string, { charge: number; deposit: number }>();
  let skipped = 0;

  for (const r of rows) {
    const desc = String(r["Description"] ?? "");
    if (!desc.toLowerCase().includes("insurance")) continue;

    const date = parseProcessedDate(r["Processed"]);
    const tranType = String(r["Tran Type"] ?? "")
      .trim()
      .toLowerCase();
    if (!date || (tranType !== "charge" && tranType !== "deposit")) {
      skipped += 1;
      continue;
    }

    const amount = parseAmount(r["Amount"]);
    const bucket = byDate.get(date) ?? { charge: 0, deposit: 0 };
    if (tranType === "charge") bucket.charge += amount;
    else bucket.deposit += amount;
    byDate.set(date, bucket);
  }

  const out: Row[] = [...byDate.entries()]
    .map(([date, v]) => ({
      date,
      chargeTotal: v.charge,
      depositTotal: v.deposit,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { rows: out, skipped };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function downloadXlsx(rows: Row[]) {
  const aoa = [
    ["Date", "Charge total", "Deposit total"],
    ...rows.map((r) => [r.date, round2(r.chargeTotal), round2(r.depositTotal)]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Insurance Summary");
  XLSX.writeFile(book, "insurance-summary.xlsx");
}

export default function InsuranceReport() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);

  async function handleDrop(files: File[]) {
    setError(null);
    setRows(null);
    setSkipped(0);

    const file = files[0];
    if (!file) return;
    setSourceName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array" });
      const firstSheetName = book.SheetNames[0];
      if (!firstSheetName) {
        setError("Workbook has no sheets.");
        return;
      }
      const sheet = book.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });
      const { rows, skipped } = summarize(json);
      if (rows.length === 0) {
        setError("No insurance rows found in the first sheet.");
        return;
      }
      setRows(rows);
      setSkipped(skipped);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to parse the spreadsheet.",
      );
    }
  }

  return (
    <Stack gap="md">
      <Title order={2}>Insurance summary</Title>
      <Text c="dimmed" size="sm">
        Drop a monthly transactions spreadsheet (.xlsx). The tool filters rows
        whose Description contains &ldquo;insurance&rdquo;, groups by the
        Processed date, and totals Charge and Deposit amounts per day.
      </Text>

      <Dropzone
        onDrop={handleDrop}
        accept={MS_EXCEL_MIME_TYPE}
        multiple={false}
        maxSize={20 * 1024 * 1024}
      >
        <Group justify="center" mih={120} style={{ pointerEvents: "none" }}>
          <Stack gap={4} align="center">
            <Text size="lg">Drop the .xlsx here</Text>
            <Text size="sm" c="dimmed">
              or click to browse
            </Text>
          </Stack>
        </Group>
      </Dropzone>

      {sourceName && (
        <Text size="sm" c="dimmed">
          Loaded: {sourceName}
        </Text>
      )}

      {error && (
        <Alert color="red" title="Could not generate report">
          {error}
        </Alert>
      )}

      {rows && rows.length > 0 && (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text fw={500}>
              {rows.length} day{rows.length === 1 ? "" : "s"} summarized
              {skipped > 0 &&
                ` (skipped ${skipped} insurance row${skipped === 1 ? "" : "s"} with missing date or Tran Type)`}
            </Text>
            <Button onClick={() => downloadXlsx(rows)}>Download .xlsx</Button>
          </Group>

          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Charge total</Table.Th>
                <Table.Th>Deposit total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.date}>
                  <Table.Td>{r.date}</Table.Td>
                  <Table.Td>{round2(r.chargeTotal).toFixed(2)}</Table.Td>
                  <Table.Td>{round2(r.depositTotal).toFixed(2)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}
    </Stack>
  );
}
