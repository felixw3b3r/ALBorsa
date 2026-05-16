"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Calculator } from 'lucide-react';
import { motion } from 'framer-motion';

export default function IPONavbar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Hydration mismatch'i önlemek için component'in client'da mount olmasını bekliyoruz
  useEffect(() => {
    setMounted(true);
  }, []);

  const navItems = [
    { label: 'Halka Arz Takvimi', href: '/halka-arz/takvim', icon: Calendar },
    { label: 'Tavan Serisi Hesapla', href: '/halka-arz/tavan-hesapla', icon: Calculator },
  ];

  return (
    <div className="flex items-center justify-center mb-12" suppressHydrationWarning>
      <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-md">
        {navItems.map((item) => {
          // Handle both /halka-arz and /halka-arz/takvim as active for Takvim
          // Client mount olana kadar hiçbirini aktif göstermiyoruz (SSR tutarlılığı için)
          const isActive = mounted && (pathname === item.href || (item.href === '/halka-arz/takvim' && pathname === '/halka-arz'));
          
          return (
            <Link key={item.href} href={item.href}>
              <button
                className={`relative flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black transition-all ${
                  isActive 
                    ? 'text-white' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="ipo-nav-bg"
                    className="absolute inset-0 bg-neon-purple rounded-xl shadow-[0_0_20px_rgba(188,19,254,0.5)]"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <item.icon size={16} className="relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
