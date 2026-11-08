"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Home, Layers3, LineChart, LogIn, Menu, Moon, PieChart, Sparkles, TrendingUp, X } from 'lucide-react';
import styles from './WarmLanding.module.css';

const MotionLink = motion.create(Link);

const links = [
  { label: 'Ana Sayfa', href: '/', icon: Home },
  { label: 'Portföy', href: '/portfolio', icon: PieChart },
  { label: 'Reel Getiri', href: '/real-getiri', icon: BarChart3 },
  { label: 'Piyasalar', href: '/piyasalar', icon: LineChart },
  { label: 'Halka Arz', href: '/halka-arz', icon: Layers3 },
  { label: 'AI Analiz', href: '/ai-analiz', icon: Sparkles },
];

export default function WarmLanding({ onDark }: { onDark: () => void }) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  return (
    <div className={styles.page}>
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`} aria-label="Ana gezinme">
        <Link href="/" className={styles.logo} aria-label="ALBorsa ana sayfa"><TrendingUp size={22} /><span>AL<span>Borsa</span></span></Link>
        <button className={styles.menuButton} onClick={() => setOpen(!open)} aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={open}>{open ? <X size={20}/> : <Menu size={20}/>}</button>
        <div className={styles.navLabel}>MENÜ</div>
        <nav className={styles.nav}>
          {links.map(({ label, href, icon: Icon }, i) => <MotionLink whileHover={{ x: 4 }} key={href} href={href} aria-label={label} title={label} className={i === 0 ? styles.active : ''} aria-current={i === 0 ? 'page' : undefined}><Icon size={19}/><span>{label}</span></MotionLink>)}
        </nav>
        <div className={styles.sideBottom}><button onClick={onDark} aria-label="Siyah temaya geç" title="Siyah temaya geç"><Moon size={19}/><span>Siyah temaya geç</span></button><Link href="/login" aria-label="Giriş yap" title="Giriş yap"><LogIn size={19}/><span>Giriş yap</span></Link></div>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}><span>YATIRIMLARINIZA DAHA YAKINDAN BAKIN</span><button onClick={onDark}><Moon size={15}/> Siyah tema</button></header>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}><span /> ALBORSA İLE TANIŞIN</span>
            <h1>Yatırımın<br/><em>net tarafı.</em></h1>
            <p>Portföyünüzü takip edin, piyasaları keşfedin ve verilerin ardındaki büyük resmi görün.</p>
            <div className={styles.actions}><Link className={styles.primary} href="/register">Ücretsiz başlayın <ArrowRight size={18}/></Link><a className={styles.secondary} href="#kesfet">Platformu keşfedin <ArrowDownRight size={18}/></a></div>
            <div className={styles.heroFoot}><span>01 / 03</span><div/><span>VERİYE DAHA YAKIN</span></div>
          </div>
          <motion.div className={styles.showcase} aria-label="Platform özellikleri" initial={reducedMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease: "easeOut" }}>
            <div className={styles.showcaseTop}><span>ALBORSA / GENEL BAKIŞ</span><span>●</span></div>
            <div className={styles.showcaseBody}><div><span className={styles.cardLabel}>YATIRIMLARINIZ</span><h2>Her şey<br/>tek bir yerde.</h2><p>Piyasalar, portföy ve analizler için sade bir alan.</p></div><div className={styles.chart} aria-hidden="true"><div className={styles.chartLines}/><svg viewBox="0 0 300 120" preserveAspectRatio="none"><path d="M0 100 C25 95 35 65 62 74 S98 88 123 58 S160 67 183 48 S220 55 244 29 S280 32 300 8" fill="none" stroke="#b78d6b" strokeWidth="3"/></svg></div><div className={styles.showcaseFooter}><span><i className={styles.green}/> Kâr</span><span><i className={styles.red}/> Zarar</span><span>ALBORSA</span></div></div>
            <div className={styles.floating}><span>DAHA NET BİR BAKIŞ</span><ArrowUpRight size={20}/></div>
          </motion.div>
        </section>
        <section className={styles.features} id="kesfet"><div className={styles.sectionHead}><div><span className={styles.eyebrow}>SİZİN İÇİN TASARLANDI</span><h2>Bir bakışta daha fazlası.</h2></div><p>Yatırım yolculuğunuzun her adımında ihtiyaç duyduğunuz araçlar.</p></div><div className={styles.featureGrid}>
          {[{n:'01', icon:PieChart, title:'Portföy takibi', text:'Varlıklarınızı tek bir yerden izleyin ve performansınızı takip edin.', href:'/portfolio'}, {n:'02', icon:BarChart3, title:'Reel kâr / zarar', text:'Kazancınıza farklı bir açıdan bakın, gerçek getirinizi değerlendirin.', href:'/real-getiri'}, {n:'03', icon:LineChart, title:'Piyasaları keşfedin', text:'Borsa İstanbul ve dünya piyasalarını yakından takip edin.', href:'/piyasalar'}].map(({n,icon:Icon,title,text,href}, index) => <MotionLink initial={reducedMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.25, delay: reducedMotion ? 0 : index * 0.055 }} whileHover={reducedMotion ? undefined : { y: -5 }} key={n} href={href} className={styles.feature}><div className={styles.featureTop}><Icon size={22}/><span>{n}</span></div><h3>{title}</h3><p>{text}</p><span className={styles.featureLink}>İncele <ArrowRight size={16}/></span></MotionLink>)}
        </div></section>
        <footer className={styles.footer}><strong>ALBorsa<span>.</span></strong><p>© 2026 ALBorsa. Yatırım tavsiyesi değildir.</p><Link href="/login">Hesabınıza giriş yapın ↗</Link></footer>
      </main>
    </div>
  );
}
