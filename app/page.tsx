'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { computeDailyRow, aggregateDailyTotals, formatETB, ComputedDailyRow } from '@/lib/calculations';

export default function DailyScreen() {
  const [currentDate, setCurrentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [inventory, setInventory] = useState<ComputedDailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAndBuildDailySchema();

    const channel = supabase
      .channel('daily_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_records' }, () => {
        fetchAndBuildDailySchema();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentDate]);

  const fetchAndBuildDailySchema = async () => {
    setLoading(true);
    
    // 1. Grab base products
    const { data: products } = await supabase.from('products').select('*');
    if (!products) return;

    // 2. Fetch current day's record entries
    const { data: dailyRecords } = await supabase
      .from('daily_records')
      .select('*, products(name_en, name_am, selling_price, min_target)')
      .eq('date', currentDate);

    // 3. Query yesterday's metrics for default fill metrics
    const yesterdayObj = new Date(currentDate);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = yesterdayObj.toISOString().split('T')[0];
    
    const { data: yesterdayRecords } = await supabase
      .from('daily_records')
      .select('product_id, remaining_stock')
      .eq('date', yesterdayStr);

    // 4. Mesh missing records dynamically to guarantee rows for every product item
    const localizedRows = products.map((prod) => {
      const match = dailyRecords?.find((r) => r.product_id === prod.id);
      if (match) return computeDailyRow(match);

      const yesterdayMatch = yesterdayRecords?.find((y) => y.product_id === prod.id);
      const defaultBeginning = yesterdayMatch ? yesterdayMatch.remaining_stock : 0;

      return computeDailyRow({
        id: `mock-${prod.id}`,
        product_id: prod.id,
        date: currentDate,
        beginning_stock: defaultBeginning,
        production_qty: 0,
        reject_qty: 0,
        promotion_qty: 0,
        delivery_qty: 0,
        remaining_stock: defaultBeginning,
        products: prod,
      });
    });

    setInventory(localizedRows);
    setLoading(false);
  };

  const saveRowMutation = async (row: ComputedDailyRow, updatedField: string, value: number) => {
    const rawPayload = {
      product_id: row.product_id,
      date: currentDate,
      beginning_stock: updatedField === 'beginning_stock' ? value : row.beginning_stock,
      production_qty: updatedField === 'production_qty' ? value : row.production_qty,
      reject_qty: updatedField === 'reject_qty' ? value : row.reject_qty,
      promotion_qty: updatedField === 'promotion_qty' ? value : row.promotion_qty,
      remaining_stock: updatedField === 'remaining_stock' ? value : row.remaining_stock,
    };

    if (row.id.startsWith('mock-')) {
      await supabase.from('daily_records').insert([rawPayload]);
    } else {
      await supabase.from('daily_records').update(rawPayload).eq('id', row.id);
    }
  };

  const handleValueChange = (productId: string, field: string, text: string) => {
    const num = parseInt(text) || 0;
    const modified = inventory.map((row) => {
      if (row.product_id === productId) {
        const rawUpdated = { ...row, [field]: num };
        const recomputed = computeDailyRow(rawUpdated);
        saveRowMutation(recomputed, field, num);
        return recomputed;
      }
      return row;
    });
    setInventory(modified);
  };

  const totals = aggregateDailyTotals(inventory);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Base Inventories...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 font-sans antialiased md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col justify-between border-b border-gray-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Daily Stock Sheet</h1>
            <p className="text-sm text-gray-500">Live Production & Reconciliation</p>
          </div>
          <input
            type="date"
            className="mt-2 rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:outline-none sm:mt-0"
            value={currentDate}
            onChange={(e) => setCurrentDate(e.target.value)}
          />
        </header>

        <div className="w-full overflow-x-auto bg-white shadow-sm ring-1 ring-black/5 rounded-xl">
          <table className="min-w-[900px] w-full border-collapse text-left text-sm text-gray-500">
            <thead className="bg-gray-100 text-xs font-semibold uppercase text-gray-700">
              <tr>
                <th className="px-4 py-4">Product Name / ምርት</th>
                <th className="px-2 py-4 text-center">Beginning / መጀመሪያ</th>
                <th className="px-2 py-4 text-center">Produced / ምርት</th>
                <th className="px-2 py-4 text-center">Rejects / ብልሽት</th>
                <th className="px-2 py-4 text-center">Promo / ማስተዋወቂያ</th>
                <th className="px-2 py-4 text-center">Delivery / ስርጭት</th>
                <th className="px-2 py-4 text-center">Remaining / ቀሪ ስቶክ</th>
                <th className="px-2 py-4 text-center">Sold / የተሸጠ</th>
                <th className="px-4 py-4 text-right">Revenue / ገቢ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {inventory.map((row) => (
                <tr key={row.product_id} className={`transition-colors ${row.isNegativeSold ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-4 font-medium text-gray-900">
                    <div className="text-sm font-semibold">{row.products?.name_en}</div>
                    <div className="text-xs font-normal text-gray-400">{row.products?.name_am}</div>
                  </td>
                  <td className="px-2 py-4">
                    <input
                      type="number"
                      className="mx-auto block w-16 rounded border p-1 text-center"
                      value={row.beginning_stock}
                      onChange={(e) => handleValueChange(row.product_id, 'beginning_stock', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-4">
                    <input
                      type="number"
                      className="mx-auto block w-16 rounded border p-1 text-center"
                      value={row.production_qty}
                      onChange={(e) => handleValueChange(row.product_id, 'production_qty', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-4">
                    <input
                      type="number"
                      className="mx-auto block w-16 rounded border p-1 text-center border-red-300 bg-red-50"
                      value={row.reject_qty}
                      onChange={(e) => handleValueChange(row.product_id, 'reject_qty', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-4">
                    <input
                      type="number"
                      className="mx-auto block w-16 rounded border p-1 text-center"
                      value={row.promotion_qty}
                      onChange={(e) => handleValueChange(row.product_id, 'promotion_qty', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-4 text-center font-medium text-gray-400 bg-gray-50">
                    {row.delivery_qty}
                  </td>
                  <td className="px-2 py-4">
                    <input
                      type="number"
                      className="mx-auto block w-16 rounded border p-1 text-center"
                      value={row.remaining_stock}
                      onChange={(e) => handleValueChange(row.product_id, 'remaining_stock', e.target.value)}
                    />
                  </td>
                  <td className="px-2 py-4 text-center font-bold">
                    {row.isNegativeSold ? (
                      <span className="text-xs text-red-600 animate-pulse block">Check Entry</span>
                    ) : (
                      <span className="text-gray-900">{row.sold}</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-gray-900">
                    {formatETB(row.revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-800 font-semibold text-white">
              <tr>
                <td className="px-4 py-3">Totals</td>
                <td colSpan={2}></td>
                <td className="px-2 py-3 text-center text-red-300">{totals.totalReject}</td>
                <td></td>
                <td className="px-2 py-3 text-center text-xs text-gray-300">Waste: {totals.totalWastePercent.toFixed(1)}%</td>
                <td></td>
                <td className="px-2 py-3 text-center text-emerald-400">{totals.totalSoldUnits}</td>
                <td className="px-4 py-3 text-right text-emerald-400">{formatETB(totals.totalRevenue)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </main>
  );
}