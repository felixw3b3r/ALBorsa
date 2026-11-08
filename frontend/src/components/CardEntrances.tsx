"use client";
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export default function CardEntrances({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = pageRef.current;
    if (!root) return;
    const seen = new WeakSet<Element>();
    const pending = new Set<HTMLElement>();
    let frame = 0;
    const selector = 'main .grid > div[class*="rounded-"][class*="bg-"], main .grid > a[class*="rounded-"][class*="bg-"], main .space-y-4 > div[class*="rounded-"][class*="bg-"]';
    const playPending = () => {
      frame = 0;
      const cards = [...pending].filter(card => card.isConnected).map(card => ({ card, rect: card.getBoundingClientRect() }));
      pending.clear();
      // Sort by visual rows first, then by horizontal position within the row.
      cards.sort((a, b) => Math.abs(a.rect.top - b.rect.top) < 8 ? a.rect.left - b.rect.left : a.rect.top - b.rect.top);
      cards.forEach(({ card }, index) => {
        card.animate(
          [{ opacity: 0, translate: '0 12px' }, { opacity: 1, translate: '0 0' }],
          { duration: 250, delay: Math.min(index * 55, 330), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' }
        );
      });
    };
    const intersection = new IntersectionObserver(entries => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting || seen.has(target)) return;
        intersection.unobserve(target);
        seen.add(target);
        const card = target as HTMLElement;
        // Cards with their own Framer Motion entrance keep that animation.
        if (card.style.transform || card.style.opacity || card.closest('[role="dialog"]') || card.classList.contains('animate-pulse')) return;
        pending.add(card);
      });
      if (pending.size && !frame) frame = requestAnimationFrame(playPending);
    }, { threshold: 0.08 });
    const observe = () => root.querySelectorAll(selector).forEach(element => {
      if (!seen.has(element)) intersection.observe(element);
    });
    observe();
    const mutations = new MutationObserver(observe);
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      mutations.disconnect();
      intersection.disconnect();
    };
  }, [pathname]);
  return <div ref={pageRef} className="w-full min-h-screen">{children}</div>;
}
