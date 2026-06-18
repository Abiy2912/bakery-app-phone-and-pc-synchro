'use client';
import './globals.css';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const navigation = [
    { name: '📋 Daily Sheet', href: '/' },
    { name: '🚚 Deliveries', href: '/delivery' },
    { name: '💰 Cash & Expenses', href: '/cash' },
    { name: '🎯 Target Check', href: '/min' },
    { name: '📈 Reports', href: '/reports' },
  ];

  return (
    <html lang="en" className="h-full bg-gray-50">
      <body className="h-full font-sans antialiased text-gray-900">
        <div className="flex h-screen overflow-hidden">
          
          {/* Mobile Top Navigation Bar */}
          <div className="fixed top-0 left-0 right-0 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden z-40">
            <span className="text-lg font-black tracking-tight text-gray-900">Bakery Manager</span>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus:outline-none"
            >
              {isOpen ? '✕ Close' : '☰ Menu'}
            </button>
          </div>

          {/* Sidebar Drawer Container */}
          <div className={`fixed inset-y-0 left-0 w-64 transform border-r border-gray-200 bg-white p-5 transition-transform duration-200 md:static md:translate-x-0 z-50
            ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="mb-8 hidden md:block">
              <span className="text-xl font-black tracking-tight text-gray-900">Bakery Manager</span>
              <p className="text-xs text-gray-400 font-medium">Control Center v1.0</p>
            </div>

            <nav className="space-y-1.5 pt-12 md:pt-0">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center rounded-xl px-4 py-3 text-sm font-bold transition-all ${
                      isActive
                        ? 'bg-gray-900 text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Backdrop blur overlay for mobile view */}
          {isOpen && (
            <div 
              onClick={() => setIsOpen(false)} 
              className="fixed inset-0 bg-black/20 backdrop-blur-sm md:hidden z-30"
            />
          )}

          {/* Main Application Content Container */}
          <div className="flex flex-1 flex-col overflow-y-auto pt-16 md:pt-0">
            {children}
          </div>

        </div>
      </body>
    </html>
  );
}