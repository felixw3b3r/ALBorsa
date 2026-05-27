"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        router.push('/portfolio');
      } else {
        setError(data.message || 'Kayıt başarısız.');
      }
    } catch (err) {
      setError('Bir bağlantı hatası oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#050505] text-white selection:bg-cyan-500/30">
      <Navbar />
      
      <div className="pt-32 pb-20 px-6 flex flex-col items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <h1 className="text-5xl font-black mb-4 tracking-tighter bg-gradient-to-r from-white via-white to-gray-500 bg-clip-text text-transparent italic">
              YENİ HESAP
            </h1>
            <p className="text-gray-500 font-bold uppercase tracking-[0.2em] text-xs">
              Milyonluk portföyünü oluşturmaya başla
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-50" />
            
            <form onSubmit={handleRegister} className="space-y-6">
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl text-sm font-bold flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-4">AD SOYAD</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-cyan-400 transition-colors">
                    <User size={18} />
                  </div>
                  <input 
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-14 pr-6 focus:outline-none focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all font-medium text-sm placeholder:text-gray-700"
                    placeholder="Adınız"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-4">E-POSTA ADRESİ</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-blue-400 transition-colors">
                    <Mail size={18} />
                  </div>
                  <input 
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-14 pr-6 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-medium text-sm placeholder:text-gray-700"
                    placeholder="ornek@mail.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest ml-4">ŞİFRE</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-purple-400 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input 
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-14 pr-6 focus:outline-none focus:border-purple-500/50 focus:ring-4 focus:ring-purple-500/10 transition-all font-medium text-sm placeholder:text-gray-700"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-cyan-400 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    KAYIT OL
                    <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-white/5 text-center">
              <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">
                Zaten hesabın var mı?{' '}
                <Link href="/login" className="text-white hover:text-cyan-400 transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-cyan-400">
                  GİRİŞ YAP
                </Link>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
