'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { computeDailyRow, ComputedDailyRow } from '../../lib/calculations';

export default function MinTargetsScreen() {
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [inventory, setInventory] = useState<ComputedDailyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTargetsAndProduction();

    // Live update when production numbers or products change
    const channel = supabase
      .channel('min_targets_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_records' }, () => fetchTargetsAndProduction())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchTargetsAndProduction())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetDate]);

  const fetchTargetsAndProduction = async () => {
    setLoading(true);

    // 1. Fetch products to get the baseline min_target numbers
    const { data: products } = await supabase.from('products').select('*');
    if (!products) {
      setLoading(false);
      return;
    }

    // 2. Fetch the current day's active production logs
    const { data: dailyRecords } = await supabase
      .from('daily_records')
      .select('*, products(name_en, name_am, selling_price, min_target)')
      .eq('date', targetDate);

    // 3. Build rows and calculate gaps
    const builtRows = products.map((prod) => {
      const match = dailyRecords?.find((r) => r.product_id === prod.id);
      
      return computeDailyRow(match || {
        id: `mock-${prod.id}`,
        product_id: prod.id,
        date: targetDate,
        beginning_stock: 0,
        production_qty: 0,
        reject_qty: 0,
        promotion_qty: 0,
        delivery_qty: 0,
        remaining_stock: 0,
        products: prod,
      });
    });

    setInventory(builtRows);
    setLoading(false);
  };

  // Summary Metrics
  const totalItemsTracked = inventory.length;
  const itemsMeetingTarget = inventory.filter(row => row.production_qty >= (row.products?.min_target || 0)).length;
  const itemsShort = totalItemsTracked - itemsMeetingTarget;

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Target Thresholds...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 font-sans antialiased md:p-8">
      <div className="mx-auto max-w-6xl">
        
        {/* Header Layout */}
        <header className="mb-6 flex flex-col justify-between border-b border-gray-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Minimum Targets Status</h1>
            <p className="text-sm text-gray-500">Compare shift production outputs against baseline demands</p>
          </div>
          <input
            type="date"
            className="mt-2 rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:outline-none sm:mt-0"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </header>

        {/* Target Dashboard Cards */}
        <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <span className="text-xs font-semibold text-gray-400 uppercase block">Monitored Items</span>
            <span className="text-2xl font-bold text-gray-900">{totalItemsTracked} Products</span>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4 shadow-sm ring-1 ring-emerald-600/10">
            <span className="text-xs font-semibold text-emerald-600 uppercase block">Targets Secured</span>
            <span className="text-2xl font-bold text-emerald-700">{itemsMeetingTarget} On Track</span>
          </div>
          <div className={`rounded-xl p-4 shadow-sm ${itemsShort > 0 ? 'bg-amber-50 ring-1 ring-amber-600/10' : 'bg-white ring-1 ring-black/5'}`}>
            <span className={`text-xs font-semibold uppercase block ${itemsShort > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Production Gaps</span>
            <span className={`text-2xl font-bold ${itemsShort > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
              {itemsShort} {itemsShort === 1 ? 'Product Alert' : 'Product Alerts'}
            </span>
          </div>
        </div>

        {/* Main Targets Status Display Grid */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {inventory.map((row) => {
            const target = row.products?.min_target || 0;
            const actual = row.production_qty;
            const gap = target - actual;
            const isMet = actual >= target;
            const progressPercent = target > 0 ? Math.min((actual / target) * 100, 100) : 100;

            return (
              <div 
                key={row.product_id} 
                className={`p-5 rounded-xl bg-white shadow-sm ring-1 transition-all ${
                  isMet ? 'ring-black/5 border-l-4 border-emerald-500' : 'ring-black/5 border-l-4 border-amber-500'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{row.products?.name_en}</h3>
                    <p className="text-xs text-gray-400">{row.products?.name_am}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isMet ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {isMet ? 'Met' : `Short by ${gap}`}
                  </span>
                </div>

                {/* Progress Bar Layout */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Progress</span>
                    <span className="font-semibold text-gray-700">{actual} / {target} units</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${isMet ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </main>
  );
}