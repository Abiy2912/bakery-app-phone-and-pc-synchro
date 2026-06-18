export interface ProductData {
  selling_price: number;
  name_en: string;
  name_am: string;
  min_target: number;
}

export interface RawDailyRecord {
  id: string;
  product_id: string;
  date: string;
  beginning_stock: number;
  production_qty: number;
  reject_qty: number;
  promotion_qty: number;
  delivery_qty: number;
  remaining_stock: number;
  products: ProductData;
}

export interface ComputedDailyRow extends RawDailyRecord {
  available: number;
  sold: number;
  revenue: number;
  isNegativeSold: boolean;
}

export interface DailySummaryFooter {
  totalSoldUnits: number;
  totalRevenue: number;
  totalReject: number;
  totalWastePercent: number;
}

/**
 * Derives reactive numbers for a single product record row
 */
export function computeDailyRow(row: RawDailyRecord): ComputedDailyRow {
  const available = row.beginning_stock + row.production_qty;
  const sold = available - row.remaining_stock - row.reject_qty - row.delivery_qty - row.promotion_qty;
  const isNegativeSold = sold < 0;
  const revenue = isNegativeSold ? 0 : sold * (row.products?.selling_price || 0);

  return {
    ...row,
    available,
    sold,
    revenue,
    isNegativeSold,
  };
}

/**
 * Aggregates a listing of rows for footer configurations
 */
export function aggregateDailyTotals(computedRows: ComputedDailyRow[]): DailySummaryFooter {
  let totalSoldUnits = 0;
  let totalRevenue = 0;
  let totalReject = 0;
  let totalAvailable = 0;

  computedRows.forEach((row) => {
    totalSoldUnits += row.sold;
    totalRevenue += row.revenue;
    totalReject += row.reject_qty;
    totalAvailable += row.available;
  });

  const totalWastePercent = totalAvailable > 0 ? (totalReject / totalAvailable) * 100 : 0;

  return {
    totalSoldUnits,
    totalRevenue,
    totalReject,
    totalWastePercent,
  };
}

/**
 * Currency Formatter for local view standards
 */
export function formatETB(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'ETB',
    minimumFractionDigits: 2,
  }).format(amount).replace('ETB', 'Br');
}