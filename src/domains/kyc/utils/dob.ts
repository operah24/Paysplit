const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const pad = (n: number) => String(n).padStart(2, '0');

function build(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function normaliseDob(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();

  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(text);
  if (m) return build(Number(m[3]), Number(m[2]), Number(m[1]));

  m = /^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s,]*(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    return month ? build(Number(m[3]), month, Number(m[1])) : null;
  }
  return null;
}
