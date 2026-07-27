export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): void {
  const escape = (value: string | number | boolean | null | undefined): string => {
    const raw = value == null ? '' : String(value);
    if (/[",\n\r]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(','))
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/** Excel abre CSV UTF-8 BOM; se descarga también como .xls compatible. */
export function downloadExcelCompatible(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): void {
  const escape = (value: string | number | boolean | null | undefined): string => {
    const raw = value == null ? '' : String(value);
    if (/[",\n\r]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(','))
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], {
    type: 'application/vnd.ms-excel;charset=utf-8;'
  });
  const name = filename.replace(/\.(csv|xlsx|xls)$/i, '');
  triggerDownload(blob, `${name}.xls`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
