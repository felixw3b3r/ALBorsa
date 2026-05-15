"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STOCKS_EXTENDED = [
  "THYAO", "EREGL", "ASELS", "SISE", "KCHOL", "TUPRS", "BIMAS", "GARAN", "AKBNK", "SAHOL",
  "ISCTR", "YKBNK", "VAKBN", "HALKB", "PETKM", "SASA", "HEKTS", "PGSUS", "TCELL", "ARCLK",
  "YOUR STOCK", "FROTO", "TOASO", "BIMAS", "ENKAI", "DOAS", "SOKM", "KOZAL", "KOZAA", "GUBRF"
];

// Helper to calculate stop position for "YOUR STOCK" (Index 20)
// 128px per item (text-8xl 96px + gap-8 32px)
const STOP_Y = - (20 - 4.5) * 128; 

export default function HeroBackground() {
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((prev) => (prev === 1 ? 2 : 1));
    }, 15000); // 15 saniyelik toplam döngü
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-50">
      {/* Mobile-Only Light CSS Background */}
      <div className="md:hidden absolute inset-0 bg-black">
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }} />
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-neon-purple/10 blur-[80px] rounded-full" style={{ animation: 'pulse 6s ease-in-out infinite' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 blur-[80px] rounded-full" style={{ animation: 'pulse 8s ease-in-out infinite', animationDelay: '3s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)]" />
      </div>

      {/* Desktop-Only Heavy Framer Motion Animations */}
      <div className="hidden md:block absolute inset-0">
        <AnimatePresence mode="wait">
          {phase === 1 ? (
            <motion.div
              key="phase1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              {/* Background Jagged Line Graph */}
              <svg width="100%" height="100%" className="absolute inset-0 z-0">
                <defs>
                  <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="20%" stopColor="#8b00e8" />
                    <stop offset="80%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <motion.path
                  d="M 600 400 L 700 380 L 800 450 L 900 320 L 1000 400 L 1100 420 L 1200 350 L 1400 440 L 1600 380 L 1800 410 L 2000 370"
                  fill="none"
                  stroke="url(#lineGradient)"
                  strokeWidth="3"
                  animate={{
                    d: [
                      "M 600 400 L 700 380 L 800 450 L 900 320 L 1000 400 L 1100 420 L 1200 350 L 1400 440 L 1600 380 L 1800 410 L 2000 370",
                      "M 600 410 L 700 400 L 800 430 L 900 340 L 1000 420 L 1100 400 L 1200 370 L 1400 420 L 1600 400 L 1800 390 L 2000 400",
                      "M 600 400 L 700 380 L 800 450 L 900 320 L 1000 400 L 1100 420 L 1200 350 L 1400 440 L 1600 380 L 1800 410 L 2000 370"
                    ]
                  }}
                  transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />
              </svg>

              <div className="absolute inset-0 flex items-center justify-between px-10 md:px-24 z-10">
                <div className="flex items-end gap-3 md:gap-6 h-64 relative">
                  {[180, 120, 150, 90, 130, 70, 160, 110].map((h, i) => (
                    <motion.div
                      key={i}
                      animate={{ height: [h * 0.8, h * 1.1, h * 0.9] }}
                      transition={{ duration: 5 + i * 0.3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                      className="w-4 md:w-8 bg-gradient-to-t from-neon-purple to-cyan-400 rounded-t-lg relative shadow-[0_0_15px_rgba(139,0,232,0.4)]"
                    />
                  ))}
                </div>
                <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90 drop-shadow-[0_0_15px_rgba(139,0,232,0.3)]">
                    {[
                      { d: "M 50 50 L 50 0 A 50 50 0 0 1 90 20 Z", color: "#9d00ff", dur: 3 },
                      { d: "M 50 50 L 90 20 A 50 50 0 0 1 100 50 Z", color: "#c400ff", dur: 4 },
                      { d: "M 50 50 L 100 50 A 50 50 0 0 1 70 93 Z", color: "#00f2ff", dur: 3.5 },
                      { d: "M 50 50 L 70 93 A 50 50 0 0 1 20 80 Z", color: "#6a00ff", dur: 4.5 },
                      { d: "M 50 50 L 20 80 A 50 50 0 0 1 50 0 Z", color: "#0077ff", dur: 5 },
                    ].map((item, i) => (
                      <motion.path
                        key={i}
                        d={item.d}
                        fill={item.color}
                        animate={{ scale: [1, 1.03, 1] }}
                        transition={{ duration: item.dur * 1.5, repeat: Infinity, repeatType: "reverse" }}
                        style={{ opacity: 0.9 }}
                      />
                    ))}
                  </svg>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="phase2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="absolute inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-sm"
            >
              {/* Fade to black overlay */}
              <motion.div 
                animate={{ opacity: [0, 0, 1] }}
                transition={{ duration: 7, times: [0, 0.85, 1] }}
                className="absolute inset-0 bg-black z-30"
              />

              <div className="relative w-full h-full flex items-center justify-between px-10 md:px-20 overflow-hidden"
                  style={{ maskImage: "linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)" }}>
                
                {/* Left Column (Far Left) */}
                <motion.div
                  animate={{ y: [1500, STOP_Y] }}
                  transition={{ duration: 4, ease: [0.1, 0.8, 0.2, 1] }}
                  className="flex flex-col items-center gap-12"
                >
                  {STOCKS_EXTENDED.map((stock, i) => (
                    <div key={i} className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm text-xl md:text-4xl font-bold text-white/40">
                      {stock}
                    </div>
                  ))}
                </motion.div>

                {/* CENTER IS EMPTY (Behind Main Text) */}
                <div className="flex-1" />

                {/* Right Column (Far Right) */}
                <motion.div
                  animate={{ y: [1500, STOP_Y] }}
                  transition={{ duration: 5, ease: [0.1, 0.8, 0.2, 1], delay: 0.2 }}
                  className="flex flex-col items-center gap-12"
                >
                  {STOCKS_EXTENDED.map((stock, i) => (
                    <div key={i} className="px-6 py-3 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm text-xl md:text-4xl font-bold text-white/40">
                      {stock}
                    </div>
                  ))}
                </motion.div>
              </div>

              {/* Centered Focus Point */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full h-32 bg-white/5 border-y border-white/10 backdrop-blur-md" />
              </div>

              {/* Scaling YOUR STOCK Overlay — scale sınırlandırıldı (scale:30 dwm.exe'yi çökertiyordu) */}
              <motion.div
                initial={{ scale: 1, opacity: 0 }}
                animate={{ 
                  scale: [1, 1, 1.5], 
                  opacity: [0, 1, 0]
                }}
                transition={{ duration: 7, times: [0, 0.6, 1] }}
                className="absolute z-40 text-6xl md:text-9xl font-black tracking-tighter text-neon-purple flex items-center justify-center drop-shadow-[0_0_30px_rgba(139,0,232,1)]"
              >
                YOUR STOCK
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
