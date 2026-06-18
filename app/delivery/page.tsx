'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { formatETB } from '../../lib/calculations';

export default function DeliveryScreen() {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [hotels, setHotels] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [allTimeBalances, setAllTimeBalances] = useState<Record<string, number>>({});
  
  // Form State
  const [selectedHotel, setSelectedHotel] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [qty, setQty] = useState('');
  const [paidAmount, setPaidAmount] = useState('');

  // Payment Modal/Form State
  const [payingHotelId, setPayingHotelId] = useState<string | null>(null);
  const [extraPayment, setExtraPayment] = useState('');

  useEffect(() => {
    fetchDeliveryData();

    // Set up real-time subscription for live sync across devices
    const channel = supabase
      .channel('delivery_sync_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => fetchDeliveryData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hotel_payments' }, () => fetchDeliveryData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate]);

  const fetchDeliveryData = async () => {
    // 1. Fetch base configuration items
    const { data: hotelsData } = await supabase.from('hotels').select('*');
    const { data: productsData } = await supabase.from('products').select('*');
    setHotels(hotelsData || []);
    setProducts(productsData || []);

    // 2. Fetch deliveries for the selected date
    const { data: deliveriesData } = await supabase
      .from('deliveries')
      .select('*, hotels(name), products(name_en)')
      .eq('date', selectedDate);
    setDeliveries(deliveriesData || []);

    // 3. Fetch all-time delivery lines and payments to compute true running balances
    const { data: allDeliveries } = await supabase.from('deliveries').select('hotel_id, delivered_qty, unit_price, amount_paid');
    const { data: allPayments } = await supabase.from('hotel_payments').select('hotel_id, amount');

    const balances: Record<string, number> = {};
    
    // Initialize
    hotelsData?.forEach(h => { balances[h.id] = 0; });

    // Add total values and subtract initial delivery payments
    allDeliveries?.forEach(d => {
      const lineTotal = d.delivered_qty * d.unit_price;
      balances[d.hotel_id] = (balances[d.hotel_id] || 0) + (lineTotal - d.amount_paid);
    });

    // Subtract standalone account payments
    allPayments?.forEach(p => {
      balances[p.hotel_id] = (balances[p.hotel_id] || 0) - p.amount;
    });

    setAllTimeBalances(balances);
  };

  const handleAddDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHotel || !selectedProduct || !qty) return;

    const product = products.find(p => p.id === selectedProduct);
    const unitPrice = product ? product.selling_price : 0;
    const quantityInt = parseInt(qty) || 0;
    const initialPaid = parseFloat(paidAmount) || 0;

    await supabase.from('deliveries').insert([
      {
        hotel_id: selectedHotel,
        product_id: selectedProduct,
        date: selectedDate,
        delivered_qty: quantityInt,
        unit_price: unitPrice,
        amount_paid: initialPaid,
      }
    ]);

    // Clear form states safely
    setQty('');
    setPaidAmount('');
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingHotelId || !extraPayment) return;

    await supabase.from('hotel_payments').insert([
      {
        hotel_id: payingHotelId,
        date: selectedDate,
        amount: parseFloat(extraPayment) || 0,
      }
    ]);

    setPayingHotelId(null);
    setExtraPayment('');
  };

  // Header Summary Calculations
  const todayTotalValue = deliveries.reduce((acc, d) => acc + (d.delivered_qty * d.unit_price), 0);
  const todayTotalPaid = deliveries.reduce((acc, d) => acc + d.amount_paid, 0);
  const totalOutstandingAllTime = Object.values(allTimeBalances).reduce((acc, b) => acc + b, 0);

  return (
    <main className="min-h-screen bg-gray-50 p-4 font-sans antialiased md:p-8">
      <div className="mx-auto max-w-6xl">
        
        {/* Header Layout */}
        <header className="mb-6 flex flex-col justify-between border-b border-gray-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hotel Deliveries</h1>
            <p className="text-sm text-gray-500">Log shipments, route orders, and manage balances</p>
          </div>
          <input
            type="date"
            className="mt-2 rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:outline-none sm:mt-0"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </header>

        {/* Dashboard Cards Summary Block */}
        <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <span className="text-xs font-semibold text-gray-400 uppercase block">Today's Deliveries Total</span>
            <span className="text-xl font-bold text-gray-900">{formatETB(todayTotalValue)}</span>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <span className="text-xs font-semibold text-gray-400 uppercase block">Today's Direct Cash Collected</span>
            <span className="text-xl font-bold text-emerald-600">{formatETB(todayTotalPaid)}</span>
          </div>
          <div className="rounded-xl bg-gray-900 p-4 text-white shadow-sm">
            <span className="text-xs font-semibold text-gray-400 uppercase block text-gray-400">All-Time Unpaid Balance</span>
            <span className="text-xl font-bold text-red-400">{formatETB(totalOutstandingAllTime)}</span>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Form Area */}
          <div className="md:col-span-1 bg-white p-5 rounded-xl shadow-sm ring-1 ring-black/5 h-fit">
            <h2 className="text-base font-bold text-gray-900 mb-4">Log New Delivery</h2>
            <form onSubmit={handleAddDelivery} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Select Hotel / ደንበኛ</label>
                <select className="w-full rounded-lg border p-2 text-sm bg-white" value={selectedHotel} onChange={e => setSelectedHotel(e.target.value)} required>
                  <option value="">-- Choose Hotel --</option>
                  {hotels.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Select Product / ምርት</label>
                <select className="w-full rounded-lg border p-2 text-sm bg-white" value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} required>
                  <option value="">-- Choose Product --</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name_en}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Delivered Qty / ብዛት</label>
                <input type="number" className="w-full rounded-lg border p-2 text-sm" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} required />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cash Collected Now / የተቀበሉት ብር</label>
                <input type="number" className="w-full rounded-lg border p-2 text-sm" placeholder="0.00" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
              </div>

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2 rounded-lg transition-colors">
                Submit Delivery
              </button>
            </form>
          </div>

          {/* Dynamic Content Display Area */}
          <div className="md:col-span-2 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Today's Shipment Lines</h2>
            
            <div className="w-full overflow-x-auto bg-white shadow-sm ring-1 ring-black/5 rounded-xl">
              {deliveries.length === 0 ? (
                <p className="p-4 text-sm text-gray-400 text-center">No deliveries logged for this date.</p>
              ) : (
                <table className="min-w-full border-collapse text-left text-sm text-gray-500">
                  <thead className="bg-gray-100 text-xs font-semibold uppercase text-gray-700">
                    <tr>
                      <th className="px-4 py-3">Hotel</th>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-center">Qty</th>
                      <th className="px-4 py-3 text-right">Value</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deliveries.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold text-gray-900">{d.hotels?.name}</td>
                        <td className="px-4 py-3">{d.products?.name_en}</td>
                        <td className="px-4 py-3 text-center">{d.delivered_qty}</td>
                        <td className="px-4 py-3 text-right">{formatETB(d.delivered_qty * d.unit_price)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatETB(d.amount_paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Balances by Hotel Overview */}
            <h2 className="text-base font-bold text-gray-900 pt-2">All-Time Hotel Account Ledger</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {hotels.map(h => {
                const runningDue = allTimeBalances[h.id] || 0;
                return (
                  <div key={h.id} className="bg-white p-4 rounded-xl shadow-sm ring-1 ring-black/5 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-gray-900">{h.name}</h3>
                      <p className="text-xs text-gray-400">Total Outstanding Balance</p>
                    </div>
                    <div className="text-right">
                      <span className={`block font-bold text-base ${runningDue > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                        {formatETB(runningDue)}
                      </span>
                      {runningDue > 0 && (
                        <button 
                          onClick={() => setPayingHotelId(h.id)}
                          className="mt-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-medium transition-colors"
                        >
                          Collect Payment
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Slide-Up Payment Modal */}
      {payingHotelId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="font-bold text-lg text-gray-900 mb-2">Record Account Payment</h3>
            <p className="text-xs text-gray-400 mb-4">
              This records cash received toward the overall unpaid balance of: {hotels.find(h => h.id === payingHotelId)?.name}
            </p>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Payment Amount (Br)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="w-full rounded-lg border p-2 font-bold" 
                  placeholder="0.00" 
                  value={extraPayment} 
                  onChange={e => setExtraPayment(e.target.value)} 
                  required 
                />
              </div>
              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={() => setPayingHotelId(null)} 
                  className="w-1/2 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-sm font-semibold"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}