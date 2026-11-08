"use client";

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Globe, User, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);

  const navLinks = [
    { name: "Ana Sayfa", href: "/" },
    { name: "Portfolyo", href: "/portfolio" },
    { name: "Turnusol Kağıdı", href: "/real-getiri" },
    { name: "Piyasalar", href: "/piyasalar" },
    { name: "Halka Arz", href: "/halka-arz" },
    { name: "AI Analiz", href: "/ai-analiz" },
  ];

  useEffect(() => {
    setMounted(true);
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  if (!mounted) return <nav className="fixed top-0 w-full z-50 bg-black/50 backdrop-blur-xl border-b border-white/10 px-6 py-4 h-[73px]" />;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    router.push('/login');
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-black/50 backdrop-blur-xl border-b border-white/10 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <div className="bg-neon-purple p-2 rounded-xl group-hover:rotate-12 transition-transform">
            <TrendingUp className="text-black w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tighter text-white">
            AL<span className="text-white group-hover:text-neon-purple transition-colors">Borsa</span>
          </span>
        </Link>

        {/* Dynamic Links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={`transition-all duration-300 relative pb-1 ${
                  isActive
                    ? "text-white font-bold"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {link.name}
                {isActive && (
                  <motion.div
                    layoutId="nav-underline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-neon-purple shadow-[0_0_10px_rgba(124,58,237,0.8)]"
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-gray-400 hover:text-white cursor-pointer transition-colors text-sm">
            <Globe size={18} />
            <span className="uppercase">TR</span>
          </div>

          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full">
                <div className="w-6 h-6 bg-neon-purple rounded-full flex items-center justify-center text-[10px] font-black text-white">
                  {user.name?.[0] || 'U'}
                </div>
                <span className="text-sm font-bold text-gray-200">{user.name}</span>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs font-black text-gray-500 hover:text-red-400 transition-colors uppercase tracking-widest"
              >
                Çıkış Yap
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="notranslate flex items-center gap-2 bg-white text-black px-5 py-2 rounded-full font-bold text-sm hover:bg-neon-purple hover:text-white hover:scale-105 transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            >
              <User size={18} />
              Giriş Yap
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
