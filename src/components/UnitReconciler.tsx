import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { Dropzone, MS_EXCEL_MIME_TYPE } from "@mantine/dropzone";
import * as XLSX from "xlsx";

const SYSTEM_UNIT_COLUMN = "Room Number";
const SYSTEM_CUSTOMER_COLUMN = "Customer Name";

const VEHICLE_UNIT_COLUMN = "Unit";
const VEHICLE_NAME_COLUMN = "Name";
const VEHICLE_PARKED_COLUMN = "PARKED TODAY";
const VEHICLE_VEHICLE_COLUMNS = [
  "CONTRACT Property Make/Model/Year",
  "License Plate",
  "VIN",
];

type Cell = string | number | boolean | null;
type Row = Cell[];

type Change =
  | { kind: "cleared"; unit: string; customer: string }
  | { kind: "orphaned"; unit: string; customer: string }
  | { kind: "added"; unit: string; customer: string }
  | {
      kind: "swapped";
      unit: string;
      oldCustomer: string;
      newCustomer: string;
      oldDisposition: "cleared" | "orphaned";
    };

type ReconcileResult = {
  headers: string[];
  rows: Row[];
  changes: Change[];
};

function normalize(name: unknown): string {
  return String(name ?? "")
    .trim()
    .toUpperCase();
}

function cellText(cell: unknown): string {
  if (cell == null) return "";
  return String(cell).trim();
}

function isBlankRow(row: Row): boolean {
  return row.every((cell) => cellText(cell) === "");
}

function isVehicleUnit(unit: string): boolean {
  return /^([A-Za-z])\1/.test(unit);
}

function reconcile(
  systemRows: Record<string, unknown>[],
  vehicleHeaders: string[],
  vehicleRows: Row[],
): ReconcileResult {
  const colIdx = new Map<string, number>();
  vehicleHeaders.forEach((h, i) => colIdx.set(h, i));

  const unitIdx = colIdx.get(VEHICLE_UNIT_COLUMN);
  const nameIdx = colIdx.get(VEHICLE_NAME_COLUMN);
  if (unitIdx == null || nameIdx == null) {
    throw new Error(
      `Vehicle sheet must contain "${VEHICLE_UNIT_COLUMN}" and "${VEHICLE_NAME_COLUMN}" columns.`,
    );
  }
  const parkedIdx = colIdx.get(VEHICLE_PARKED_COLUMN);
  const vehicleInfoIdxs = VEHICLE_VEHICLE_COLUMNS.map((c) =>
    colIdx.get(c),
  ).filter((x): x is number => x != null);

  const systemByUnit = new Map<string, string>();
  const systemCustomers = new Set<string>();
  for (const r of systemRows) {
    const unit = cellText(r[SYSTEM_UNIT_COLUMN]);
    if (!unit || !isVehicleUnit(unit)) continue;
    const customer = cellText(r[SYSTEM_CUSTOMER_COLUMN]);
    systemByUnit.set(unit, customer);
    if (customer) systemCustomers.add(normalize(customer));
  }

  const changes: Change[] = [];
  const inPlace: (Row | null)[] = [];
  const orphans: Row[] = [];
  const seenUnits = new Set<string>();

  function clearVehicleData(row: Row) {
    row[nameIdx!] = "";
    for (const i of vehicleInfoIdxs) row[i] = "";
    if (parkedIdx != null) row[parkedIdx] = "";
  }

  function makeOrphan(originalRow: Row): Row {
    const orphan = [...originalRow];
    orphan[unitIdx!] = "";
    return orphan;
  }

  for (const row of vehicleRows) {
    const unit = cellText(row[unitIdx]);
    const vName = cellText(row[nameIdx]);

    if (!unit) {
      inPlace.push(row);
      continue;
    }

    seenUnits.add(unit);
    const sysCustomer = systemByUnit.get(unit) ?? "";
    const sysEmpty = sysCustomer === "";

    if (sysEmpty && !vName) {
      inPlace.push(row);
      continue;
    }

    if (sysEmpty && vName) {
      if (systemCustomers.has(normalize(vName))) {
        orphans.push(makeOrphan(row));
        inPlace.push(null);
        changes.push({ kind: "orphaned", unit, customer: vName });
      } else {
        const updated = [...row];
        clearVehicleData(updated);
        inPlace.push(updated);
        changes.push({ kind: "cleared", unit, customer: vName });
      }
      continue;
    }

    if (!vName) {
      const updated = [...row];
      updated[nameIdx] = sysCustomer;
      inPlace.push(updated);
      changes.push({ kind: "added", unit, customer: sysCustomer });
      continue;
    }

    if (normalize(vName) === normalize(sysCustomer)) {
      inPlace.push(row);
      continue;
    }

    const updated = [...row];
    updated[nameIdx] = sysCustomer;
    for (const i of vehicleInfoIdxs) updated[i] = "";
    if (parkedIdx != null) updated[parkedIdx] = "";
    inPlace.push(updated);

    let oldDisposition: "cleared" | "orphaned";
    if (systemCustomers.has(normalize(vName))) {
      orphans.push(makeOrphan(row));
      oldDisposition = "orphaned";
    } else {
      oldDisposition = "cleared";
    }
    changes.push({
      kind: "swapped",
      unit,
      oldCustomer: vName,
      newCustomer: sysCustomer,
      oldDisposition,
    });
  }

  const appended: Row[] = [];
  for (const [unit, customer] of systemByUnit) {
    if (seenUnits.has(unit) || !customer) continue;
    const newRow: Row = new Array(vehicleHeaders.length).fill("");
    newRow[unitIdx] = unit;
    newRow[nameIdx] = customer;
    appended.push(newRow);
    changes.push({ kind: "added", unit, customer });
  }

  const finalRows = [
    ...inPlace.filter((r): r is Row => r !== null),
    ...appended,
    ...orphans,
  ];

  return { headers: vehicleHeaders, rows: finalRows, changes };
}

async function readSystemSheet(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array" });
  const name = book.SheetNames[0];
  if (!name) throw new Error("System workbook has no sheets.");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[name], {
    defval: "",
  });
}

async function readVehicleSheet(
  file: File,
): Promise<{ headers: string[]; rows: Row[] }> {
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array" });
  const name = book.SheetNames[0];
  if (!name) throw new Error("Vehicle workbook has no sheets.");
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[name], {
    header: 1,
    defval: "",
    blankrows: false,
  });
  if (aoa.length === 0) throw new Error("Vehicle sheet is empty.");
  const headers = aoa[0].map((h) => String(h ?? ""));
  const rows = aoa.slice(1);
  while (rows.length > 0 && isBlankRow(rows[rows.length - 1])) rows.pop();
  return { headers, rows };
}

function downloadXlsx(headers: string[], rows: Row[]) {
  const aoa: Cell[][] = [headers, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Vehicles");
  XLSX.writeFile(book, "vehicle-sheet-reconciled.xlsx");
}

const KIND_LABEL: Record<Change["kind"], string> = {
  cleared: "Cleared",
  orphaned: "Orphaned",
  added: "Added",
  swapped: "Swapped",
};

const KIND_COLOR: Record<Change["kind"], string> = {
  cleared: "red",
  orphaned: "yellow",
  added: "green",
  swapped: "blue",
};

const KIND_ORDER: Change["kind"][] = [
  "swapped",
  "orphaned",
  "cleared",
  "added",
];

function describe(change: Change): string {
  switch (change.kind) {
    case "cleared":
      return `Cleared vehicle info for ${change.customer} (no longer in system)`;
    case "orphaned":
      return `Moved ${change.customer} to bottom (still in system, possibly moved spaces)`;
    case "added":
      return `Wrote customer name ${change.customer}`;
    case "swapped":
      return `${change.oldCustomer} → ${change.newCustomer} (old ${change.oldDisposition === "orphaned" ? "orphaned to bottom" : "discarded"})`;
  }
}

export default function UnitReconciler() {
  const [systemFile, setSystemFile] = useState<File | null>(null);
  const [vehicleFile, setVehicleFile] = useState<File | null>(null);
  const [systemRows, setSystemRows] = useState<
    Record<string, unknown>[] | null
  >(null);
  const [vehicleData, setVehicleData] = useState<{
    headers: string[];
    rows: Row[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSystemDrop(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    setSystemFile(file);
    setSystemRows(null);
    try {
      setSystemRows(await readSystemSheet(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read system sheet.");
    }
  }

  async function handleVehicleDrop(files: File[]) {
    const file = files[0];
    if (!file) return;
    setError(null);
    setVehicleFile(file);
    setVehicleData(null);
    try {
      setVehicleData(await readVehicleSheet(file));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to read vehicle sheet.",
      );
    }
  }

  const { result, reconcileError } = useMemo<{
    result: ReconcileResult | null;
    reconcileError: string | null;
  }>(() => {
    if (!systemRows || !vehicleData)
      return { result: null, reconcileError: null };
    try {
      return {
        result: reconcile(systemRows, vehicleData.headers, vehicleData.rows),
        reconcileError: null,
      };
    } catch (e) {
      return {
        result: null,
        reconcileError: e instanceof Error ? e.message : "Failed to reconcile.",
      };
    }
  }, [systemRows, vehicleData]);

  const displayError = error ?? reconcileError;

  const sortedChanges = useMemo(() => {
    if (!result) return [];
    return [...result.changes].sort((a, b) => {
      const k = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
      if (k !== 0) return k;
      return a.unit.localeCompare(b.unit, undefined, { numeric: true });
    });
  }, [result]);

  const counts = useMemo(() => {
    const c: Record<Change["kind"], number> = {
      cleared: 0,
      orphaned: 0,
      added: 0,
      swapped: 0,
    };
    if (result) for (const ch of result.changes) c[ch.kind] += 1;
    return c;
  }, [result]);

  return (
    <Stack gap="md">
      <Title order={2}>Vehicle sheet reconciler</Title>
      <Text c="dimmed" size="sm">
        Drop the current system export and the current vehicle sheet. The tool
        compares them by unit and produces an updated vehicle sheet plus a
        changelog. Only system rows whose Room Number starts with a double
        letter (AA, BB, …) are considered — single-letter self-storage spaces
        are skipped. Vehicle info you've already collected is preserved when
        possible, and orphaned rows (customer still in system but no longer in
        the same unit) are moved to the bottom for review.
      </Text>

      <Group grow align="stretch">
        <Dropzone
          onDrop={handleSystemDrop}
          accept={MS_EXCEL_MIME_TYPE}
          multiple={false}
          maxSize={20 * 1024 * 1024}
        >
          <Stack gap={4} align="center" mih={120} justify="center">
            <Text size="lg">System export (.xlsx)</Text>
            <Text size="sm" c="dimmed">
              {systemFile ? systemFile.name : "drop or click to browse"}
            </Text>
          </Stack>
        </Dropzone>
        <Dropzone
          onDrop={handleVehicleDrop}
          accept={MS_EXCEL_MIME_TYPE}
          multiple={false}
          maxSize={20 * 1024 * 1024}
        >
          <Stack gap={4} align="center" mih={120} justify="center">
            <Text size="lg">Vehicle sheet (.xlsx)</Text>
            <Text size="sm" c="dimmed">
              {vehicleFile ? vehicleFile.name : "drop or click to browse"}
            </Text>
          </Stack>
        </Dropzone>
      </Group>

      {displayError && (
        <Alert color="red" title="Could not reconcile">
          {displayError}
        </Alert>
      )}

      {result && (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <Text fw={500}>{result.changes.length} changes</Text>
              {(["swapped", "orphaned", "cleared", "added"] as const).map(
                (k) =>
                  counts[k] > 0 && (
                    <Badge key={k} color={KIND_COLOR[k]} variant="light">
                      {counts[k]} {KIND_LABEL[k].toLowerCase()}
                    </Badge>
                  ),
              )}
            </Group>
            <Button
              onClick={() => downloadXlsx(result.headers, result.rows)}
              disabled={result.changes.length === 0}
            >
              Download .xlsx
            </Button>
          </Group>

          {result.changes.length === 0 ? (
            <Alert color="green" title="No changes">
              The vehicle sheet already matches the system export.
            </Alert>
          ) : (
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Unit</Table.Th>
                  <Table.Th>Detail</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sortedChanges.map((ch, i) => (
                  <Table.Tr key={`${ch.kind}-${ch.unit}-${i}`}>
                    <Table.Td>
                      <Badge color={KIND_COLOR[ch.kind]} variant="light">
                        {KIND_LABEL[ch.kind]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{ch.unit || "—"}</Table.Td>
                    <Table.Td>{describe(ch)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      )}
    </Stack>
  );
}
