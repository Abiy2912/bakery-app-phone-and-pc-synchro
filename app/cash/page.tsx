'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { computeDailyRow, formatETB } from '../../lib/calculations';

interface ExpenseRow {
  id: string;
  date: string;
  name: string;
  category: 'Ingredients' | 'Utilities' | 'Salary' | 'Rent' | 'Maintenance' | 'Other';
  paid_by: 'Shop' | 'Owner' | 'Staff';
  amount: number;
}

export default function CashScreen() {
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [salesTotal, setSalesTotal] = useState<number>(0);
  const [expensesTotal, setExpensesTotal] = useState<number>(0);
  const [cashCounted, setCashCounted] = useState<string>('');
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [categories, setCategories] = useState<{ category: string; total: number }[]>([]);

  // Form State for Adding Expenses
  const [expenseName, setExpenseName] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<'Ingredients' | 'Utilities' | 'Salary' | 'Rent' | 'Maintenance' | 'Other'>('Ingredients');
  const [expensePaidBy, setExpensePaidBy] = useState<'Shop' | 'Owner' | 'Staff'>('Shop');
  const [expenseAmount, setExpenseAmount] = useState('');

  useEffect(() => {
    fetchFinancials();

    // Set up real-time subscriptions for live phone/PC updates
    const channel = supabase
      .channel('cash_screen_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchFinancials())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_records' }, () => fetchFinancials())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [targetDate]);

  const fetchFinancials = async () => {
    // 1. Fetch sales revenues from daily records
    const { data: daily } = await supabase
      .from('daily_records')
      .select('*, products(selling_price)')
      .eq('date', targetDate);

    const calculatedSales = (daily || []).reduce((acc, current) => {
      const row = computeDailyRow(current);
      return acc + row.revenue;
    }, 0);

    // 2. Fetch expenses for the target date
    const { data: expensesData } = await supabase
      .from('expenses')
      .select('*')
      .eq('date', targetDate);

    const typedExpenses = (expensesData || []) as ExpenseRow[];
    const calculatedExpenses = typedExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);

    // 3. Group expenses by category
    const groupMap: Record<string, number> = {};
    typedExpenses.forEach((e) => {
      groupMap[e.category] = (groupMap[e.category] || 0) + Number(e.amount);
    });
    const parsedCategories = Object.entries(groupMap).map(([category, total]) => ({ category, total }));

    setSalesTotal(calculatedSales);
    setExpensesTotal(calculatedExpenses);
    setExpenses(typedExpenses);
    setCategories(parsedCategories.sort((a, b) => b.total - a.total));
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseName || !expenseAmount) return;

    await supabase.from('expenses').insert([
      {
        date: targetDate,
        name: expenseName,
        category: expenseCategory,
        paid_by: expensePaidBy,
        amount: parseFloat(expenseAmount) || 0,
      },
    ]);

    // Reset form fields
    setExpenseName('');
    setExpenseAmount('');
  };

  const handleDeleteExpense = async (id: string) => {
    await supabase.from('expenses').delete().eq('id', id);
  };

  const expectedCashOnHand = salesTotal - expensesTotal;
  const variance = cashCounted !== '' ? (parseFloat(cashCounted) || 0) - expectedCashOnHand : 0;

  return (
    <main className="min-h-screen bg-gray-50 p-4 font-sans antialiased md:p-8">
      <div className="mx-auto max-w-6xl">
        
        {/* Header layout */}
        <header className="mb-6 flex flex-col justify-between border-b border-gray-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cash & Expenses</h1>
            <p className="text-sm text-gray-500">Track shop payouts, log expenses, and balance the drawer</p>
          </div>
          <input
            type="date"
            className="mt-2 rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:outline-none sm:mt-0"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </header>

        {/* Financial KPI Grid */}
        <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <span className="text-xs font-semibold text-gray-400 uppercase block">Total Sales Revenue</span>
            <span className="text-2xl font-bold text-gray-900 mt-1">{formatETB(salesTotal)}</span>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <span className="text-xs font-semibold text-gray-400 uppercase block">Total Shift Expenses</span>
            <span className="text-2xl font-bold text-red-600 mt-1">-{formatETB(expensesTotal)}</span>
          </div>
          <div className="rounded-xl bg-gray-900 p-5 text-white shadow-sm">
            <span className="text-xs font-semibold text-gray-400 uppercase block text-gray-400">Expected Drawer Cash</span>
            <span className="text-2xl font-bold text-emerald-400 mt-1">{formatETB(expectedCashOnHand)}</span>
          </div>
        </div>

        {/* Drawer Reconciliation Section */}
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/5 grid gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Actual Physical Cash Counted in Drawer / በእጅ ያለ ብር
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-400 text-sm font-bold">Br</span>
              <input
                type="number"
                placeholder="0.00"
                className="w-full rounded-xl border border-gray-300 py-2 pl-9 pr-4 text-base font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={cashCounted}
                onChange={(e) => setCashCounted(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col justify-center bg-gray-50 rounded-xl p-4 text-center md:text-left">
            <span className="text-xs font-semibold text-gray-400 uppercase">Drawer Variance / ልዩነት</span>
            <div className={`text-2xl font-black mt-1 ${cashCounted === '' ? 'text-gray-400' : variance === 0 ? 'text-emerald-600' : variance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {cashCounted === '' ? 'Enter physical count' : variance === 0 ? 'Perfect Match' : `${variance > 0 ? '+' : ''}${formatETB(variance)}`}
            </div>
          </div>
        </div>

        {/* Lower Grid: Add Expense vs Expense Logs */}
        <div className="grid gap-6 md:grid-cols-3">
          
          {/* Add Expense Form Card */}
          <div className="md:col-span-1 bg-white p-5 rounded-xl shadow-sm ring-1 ring-black/5 h-fit">
            <h2 className="text-base font-bold text-gray-900 mb-4">Log New Expense</h2>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Expense Description / ምክንያት</label>
                <input 
                  type="text" 
                  className="w-full rounded-lg border p-2 text-sm" 
                  placeholder="e.g. Flour delivery, Yeast, Electric bill" 
                  value={expenseName} 
                  onChange={e => setExpenseName(e.target.value)} 
                  required 
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category / ዘርፍ</label>
                <select className="w-full rounded-lg border p-2 text-sm bg-white" value={expenseCategory} onChange={e => setExpenseCategory(e.target.value as any)}>
                  <option value="Ingredients">Ingredients</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Salary">Salary</option>
                  <option value="Rent">Rent</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Paid By / ከየት ተከፈለ</label>
                <select className="w-full rounded-lg border p-2 text-sm bg-white" value={expensePaidBy} onChange={e => setExpensePaidBy(e.target.value as any)}>
                  <option value="Shop">Shop (Drawer Cash)</option>
                  <option value="Owner">Owner (Direct Out of Pocket)</option>
                  <option value="Staff">Staff (Petty Cash)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Amount / የብር መጠን</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="w-full rounded-lg border p-2 text-sm font-bold" 
                  placeholder="0.00" 
                  value={expenseAmount} 
                  onChange={e => setExpenseAmount(e.target.value)} 
                  required 
                />
              </div>

              <button type="submit" className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm py-2 rounded-lg transition-colors">
                Log Expense
              </button>
            </form>
          </div>

          {/* Expenses List & Category Breakdown Area */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Breakdown by Category Cards */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Expenses by Category</h2>
              {categories.length === 0 ? (
                <p className="text-sm text-gray-400">No expenses recorded today.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {categories.map(c => (
                    <div key={c.category} className="bg-white p-3 rounded-xl shadow-sm ring-1 ring-black/5 flex justify-between items-center">
                      <span className="text-sm font-semibold text-gray-700">{c.category}</span>
                      <span className="text-sm font-bold text-gray-900">{formatETB(c.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Individual Itemized Line Items Table */}
            <div>
              <h2 className="text-base font-bold text-gray-900 mb-3">Itemized Payout Logs</h2>
              <div className="w-full overflow-x-auto bg-white shadow-sm ring-1 ring-black/5 rounded-xl">
                {expenses.length === 0 ? (
                  <p className="p-4 text-sm text-gray-400 text-center">No transactions logged for this shift.</p>
                ) : (
                  <table className="min-w-full border-collapse text-left text-sm text-gray-500">
                    <thead className="bg-gray-100 text-xs font-semibold uppercase text-gray-700">
                      <tr>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {expenses.map(e => (
                        <tr key={e.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{e.name}</td>
                          <td className="px-4 py-3 text-xs"><span className="bg-gray-100 px-2 py-1 rounded-md font-medium">{e.category}</span></td>
                          <td className="px-4 py-3 text-xs text-gray-400">{e.paid_by}</td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">-{formatETB(e.amount)}</td>
                          <td className="px-4 py-3 text-center">
                            <button 
                              onClick={() => handleDeleteExpense(e.id)}
                              className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </main>
  );
}