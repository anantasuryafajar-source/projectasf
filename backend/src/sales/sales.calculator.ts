// Pure invoice math (§7 / FR-4.1). No I/O so it is trivially unit-testable.

export interface CalculatorItem {
  quantity: number;
  unit_price: number;
  taxable: boolean;
  conversion_to_base: number;
}

export interface CalculatedLine {
  line_subtotal: number; // gross = quantity * unit_price
  line_vat: number;
  base_quantity: number; // quantity * conversion_to_base (FR-3.4)
}

export interface InvoiceTotals {
  lines: CalculatedLine[];
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total_amount: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

/**
 * Compute line and invoice totals.
 * - subtotal = Σ(quantity * unit_price)
 * - discount_total is allocated across lines proportionally to gross
 * - VAT is charged per taxable line on its net (gross - allocated discount)
 * - total_amount = subtotal - discount_total + vat_amount
 */
export function computeInvoiceTotals(
  items: CalculatorItem[],
  discountTotal: number,
  vatRate: number,
): InvoiceTotals {
  const grosses = items.map((i) => round2(i.quantity * i.unit_price));
  const subtotal = round2(grosses.reduce((s, g) => s + g, 0));

  const lines: CalculatedLine[] = items.map((item, idx) => {
    const gross = grosses[idx];
    const allocatedDiscount =
      subtotal > 0 ? round2(discountTotal * (gross / subtotal)) : 0;
    const net = round2(gross - allocatedDiscount);
    const lineVat = item.taxable ? round2(net * vatRate) : 0;
    return {
      line_subtotal: gross,
      line_vat: lineVat,
      base_quantity: round4(item.quantity * item.conversion_to_base),
    };
  });

  const vatAmount = round2(lines.reduce((s, l) => s + l.line_vat, 0));
  const totalAmount = round2(subtotal - discountTotal + vatAmount);

  return {
    lines,
    subtotal,
    discount_total: round2(discountTotal),
    vat_amount: vatAmount,
    total_amount: totalAmount,
  };
}
