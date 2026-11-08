"use client";
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, PieChart, BarChart3, LineChart, Layers3, Sparkles, Moon, LogIn, TrendingUp, Menu, X } from 'lucide-react';
import styles from './WarmLanding.module.css';

const MotionLink = motion.create(Link);

const links = [
  { label: 'Ana Sayfa', href: '/', icon: Home }, { label: 'Portföy', href: '/portfolio', icon: PieChart },
  { label: 'Reel Getiri', href: '/real-getiri', icon: BarChart3 }, { label: 'Piyasalar', href: '/piyasalar', icon: LineChart },
  { label: 'Halka Arz', href: '/halka-arz', icon: Layers3 }, { label: 'AI Analiz', href: '/ai-analiz', icon: Sparkles },
];
export default function PortfolioWarmNav({onDark, tucked = false}:{onDark:()=>void, tucked?: boolean}) {
  const [open,setOpen] = useState(false);
  const pathname = usePathname();
  return <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''} ${tucked ? styles.sidebarTucked : ''}`} aria-label="Ana gezinme">
    <Link href="/" className={styles.logo} aria-label="ALBorsa ana sayfa"><TrendingUp size={22}/><span>AL<span>Borsa</span></span></Link>
    <button className={styles.menuButton} onClick={() => setOpen(!open)} aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={open}>{open ? <X size={20}/> : <Menu size={20}/>}</button>
    <div className={styles.navLabel}>MENÜ</div>
    <nav className={styles.nav}>{links.map(({label,href,icon:Icon}) => <MotionLink whileHover={{x:4}} key={href} href={href} aria-label={label} title={label} className={(href === pathname || ((href === '/halka-arz' || href === '/piyasalar') && pathname.startsWith(href + '/'))) ? styles.active : ''} aria-current={(href === pathname || ((href === '/halka-arz' || href === '/piyasalar') && pathname.startsWith(href + '/'))) ? 'page' : undefined}><Icon size={19}/><span>{label}</span></MotionLink>)}</nav>
    <div className={styles.sideBottom}><button onClick={onDark} aria-label="Siyah temaya geç" title="Siyah temaya geç"><Moon size={19}/><span>Siyah temaya geç</span></button><Link href="/login" aria-label="Giriş yap" title="Giriş yap"><LogIn size={19}/><span>Giriş yap</span></Link></div>
  </aside>;
}
