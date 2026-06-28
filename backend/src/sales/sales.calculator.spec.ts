import { computeInvoiceTotals } from './sales.calculator';

describe('computeInvoiceTotals (§7 / FR-4.1)', () => {
  it('matches the PRD §7 sample: 10 cartons @ 250000, VAT 11%', () => {
    const totals = computeInvoiceTotals(
      [
        {
          quantity: 10,
          unit_price: 250000,
          taxable: true,
          conversion_to_base: 24,
        },
      ],
      0,
      0.11,
    );

    expect(totals.subtotal).toBe(2500000);
    expect(totals.vat_amount).toBe(275000);
    expect(totals.total_amount).toBe(2775000); // §7.2 expected response
    expect(totals.lines[0].base_quantity).toBe(240); // 10 * 24 bottles (FR-3.4)
    expect(totals.lines[0].line_vat).toBe(275000);
  });

  it('does not charge VAT on non-taxable lines (FR-4.1)', () => {
    const totals = computeInvoiceTotals(
      [
        {
          quantity: 5,
          unit_price: 100000,
          taxable: false,
          conversion_to_base: 1,
        },
      ],
      0,
      0.11,
    );

    expect(totals.subtotal).toBe(500000);
    expect(totals.vat_amount).toBe(0);
    expect(totals.total_amount).toBe(500000);
  });

  it('applies invoice discount before VAT', () => {
    const totals = computeInvoiceTotals(
      [
        {
          quantity: 1,
          unit_price: 1000000,
          taxable: true,
          conversion_to_base: 1,
        },
      ],
      100000, // 10% discount
      0.11,
    );

    expect(totals.subtotal).toBe(1000000);
    // VAT on net (1,000,000 - 100,000) = 900,000 * 11% = 99,000
    expect(totals.vat_amount).toBe(99000);
    expect(totals.total_amount).toBe(999000); // 1,000,000 - 100,000 + 99,000
  });

  it('sums multiple lines and mixes taxable/non-taxable', () => {
    const totals = computeInvoiceTotals(
      [
        {
          quantity: 2,
          unit_price: 250000,
          taxable: true,
          conversion_to_base: 24,
        },
        {
          quantity: 3,
          unit_price: 100000,
          taxable: false,
          conversion_to_base: 12,
        },
      ],
      0,
      0.11,
    );

    expect(totals.subtotal).toBe(800000); // 500,000 + 300,000
    expect(totals.vat_amount).toBe(55000); // only the taxable 500,000 * 11%
    expect(totals.total_amount).toBe(855000);
    expect(totals.lines[1].base_quantity).toBe(36); // 3 * 12
  });
});
