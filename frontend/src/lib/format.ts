const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatIDR(value: number | string | null | undefined): string {
  return idr.format(Number(value ?? 0));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
