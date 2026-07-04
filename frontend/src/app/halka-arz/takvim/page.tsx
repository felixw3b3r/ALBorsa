import React from 'react';
import TakvimClient from './TakvimClient';
import { type IPOSummary } from '@/lib/ipoMemoryCache';

export const revalidate = 60; // Revalidate page every 60 seconds (ISR)

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

async function getIpoList(): Promise<IPOSummary[]> {
  try {
    const res = await fetch(`${API_URL}/halkaarz`, {
      next: { revalidate: 60 }, // next-specific ISR
    });
    if (!res.ok) {
      throw new Error('Failed to fetch IPO list');
    }
    return await res.json();
  } catch (err) {
    console.error('Error fetching IPO list on server:', err);
    return [];
  }
}

export default async function IPOTakvimPage() {
  const ipoList = await getIpoList();

  return <TakvimClient initialIpoList={ipoList} />;
}
