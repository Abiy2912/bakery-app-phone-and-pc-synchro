'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { computeDailyRow, formatETB } from '../../lib/calculations';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

// Register ChartJS modules
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

export default function ReportsScreen() {
  const [daysRange, setDaysRange] = useState<number>(7);
  const [salesTotal, setSalesTotal] = useState<number>(0);
  const [expensesTotal, setExpensesTotal] = useState<number>(0);
  const [totalRejects, setTotalRejects] = useState<number>(0);
  
  // Chart Data States
  const [salesChartData, setSalesChartData] = useState<any>(null);
  const [expenseChartData, setExpenseChartData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchReportAnalytics();
  }, [daysRange]);

  const fetchReportAnalytics = async () => {
    setLoading(true);

    // Calculate past date boundary
    const cutOffDate = new Date();
    cutOffDate.setDate(cutOffDate.getDate() - daysRange);
    const cutOffStr = cutOffDate.toISOString().split('T')[0];

    // 1. Fetch sales datasets
    const { data: dailyRecords } = await supabase
      .from('daily_records')
      .select('*, products(selling_price)')
      .gte('date', cutOffStr)
      .order('date', { ascending: true });

    // 2. Fetch expense datasets
    const { data: expensesData } = await supabase
      .from('expenses')
      .select('*')
      .gte('date', cutOffStr);

    const records = dailyRecords || [];
    const expenses = expensesData || [];

    // Map aggregates
    let aggregatedSales = 0;
    let aggregatedRejects = 0;
    const salesByDateMap: Record<string, number> = {};

    records.forEach((rec) => {
      const computed = computeDailyRow(rec);
      aggregatedSales += computed.revenue;
      aggregatedRejects += computed.reject_qty;
      salesByDateMap[rec.date] = (salesByDateMap[rec.date] || 0) + computed.revenue;
    });

    const aggregatedExpenses = expenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    
    // Group expenses by category for pie chart
    const expenseCategoryMap: Record<string, number> = {};
    expenses.forEach((exp) => {
      expenseCategoryMap[exp.category] = (expenseCategoryMap[exp.category] || 0) + Number(exp.amount);
    });

    setSalesTotal(aggregatedSales);
    setExpensesTotal(aggregatedExpenses);
    setTotalRejects(aggregatedRejects);

    // 3. Assemble Sales Trend Graph Data
    const uniqueSortedDates = Object.keys(salesByDateMap).sort();
    setSalesChartData({
      labels: uniqueSortedDates.map(d => d.slice(5)), // Show MM-DD format
      datasets: [
        {
          label: 'Revenue (Br)',
          data: uniqueSortedDates.map(d => salesByDateMap[d]),
          backgroundColor: '#3b82f6',
          borderRadius: 6,
        },
      ],
    });

    // 4. Assemble Expense Categories Breakdown Data
    setExpenseChartData({
      labels: Object.keys(expenseCategoryMap),
      datasets: [
        {
          data: Object.values(expenseCategoryMap),
          backgroundColor: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#ec4899'],
          borderWidth: 1,
        },
      ],
    });

    setLoading(false);
  };

  const netProfit = salesTotal - expensesTotal;

  if (loading) return <div className="p-8 text-center text-gray-500">Generating Analytics Dashboard...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-4 font-sans antialiased md:p-8">
      <div className="mx-auto max-w-6xl">
        
        {/* Header Layout */}
        <header className="mb-6 flex flex-col justify-between border-b border-gray-200 pb-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Performance Reports</h1>
            <p className="text-sm text-gray-500">Monitor margins, waste overheads, and financial growth metrics</p>
          </div>
          <select 
            className="mt-2 rounded-lg border border-gray-300 p-2 text-sm bg-white text-gray-900 focus:outline-none sm:mt-0"
            value={daysRange}
            onChange={(e) => setDaysRange(Number(e.target.value))}
          >
            <option value={7}>Past 7 Days</option>
            <option value={30}>Past 30 Days</option>
            <option value={90}>Past 90 Days</option>
          </select>
        </header>

        {/* Executive Summary Cards */}
        <div className="grid gap-4 mb-6 grid-cols-1 sm:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <span className="text-xs font-semibold text-gray-400 uppercase block">Total Revenue</span>
            <span className="text-xl font-bold text-gray-900 block mt-1">{formatETB(salesTotal)}</span>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <span className="text-xs font-semibold text-gray-400 uppercase block">Total Expenses</span>
            <span className="text-xl font-bold text-red-600 block mt-1">-{formatETB(expensesTotal)}</span>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <span className="text-xs font-semibold text-gray-400 uppercase block">Total Rejects</span>
            <span className="text-xl font-bold text-amber-600 block mt-1">{totalRejects} Units</span>
          </div>
          <div className={`rounded-xl p-4 shadow-sm text-white ${netProfit >= 0 ? 'bg-gray-900' : 'bg-red-900'}`}>
            <span className="text-xs font-semibold text-gray-400 uppercase block text-gray-300">Net Profit Margin</span>
            <span className={`text-xl font-bold block mt-1 ${netProfit >= 0 ? 'text-emerald-400' : 'text-red-300'}`}>
              {formatETB(netProfit)}
            </span>
          </div>
        </div>

        {/* Graphs Visualization Layout */}
        <div className="grid gap-6 md:grid-cols-3">
          
          {/* Revenue Trend Over Time */}
          <div className="md:col-span-2 bg-white p-5 rounded-xl shadow-sm ring-1 ring-black/5">
            <h2 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider text-gray-400">Daily Sales Growth</h2>
            <div className="h-64 w-full flex items-center justify-center">
              {salesChartData ? <Bar data={salesChartData} options={{ responsive: true, maintainAspectRatio: false }} /> : <p className="text-gray-400">No sales metrics</p>}
            </div>
          </div>

          {/* Expense Allocation Distribution */}
          <div className="md:col-span-1 bg-white p-5 rounded-xl shadow-sm ring-1 ring-black/5">
            <h2 className="text-sm font-bold text-gray-900 mb-4 uppercase tracking-wider text-gray-400">Expense Allocations</h2>
            <div className="h-64 w-full flex items-center justify-center">
              {expenseChartData && expenseChartData.labels.length > 0 ? (
                <Pie data={expenseChartData} options={{ responsive: true, maintainAspectRatio: false }} />
              ) : (
                <p className="text-sm text-gray-400 text-center">No structural expenses added inside this date window.</p>
              )}
            </div>
          </div>

        </div>

      </div>
    </main>
  );
}