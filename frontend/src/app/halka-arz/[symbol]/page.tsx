import React from 'react';
import DetailClient from './DetailClient';
import { type Metadata } from 'next';

export const revalidate = 60; // Revalidate every 60 seconds (ISR)

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

async function getIpoDetail(symbol: string) {
  try {
    const res = await fetch(`${API_URL}/halkaarz/${symbol}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch IPO detail for ${symbol}`);
    }
    return await res.json();
  } catch (err) {
    console.error(`Error fetching IPO detail for ${symbol} on server:`, err);
    return null;
  }
}

// Generate static routes at build time
export async function generateStaticParams() {
  try {
    const res = await fetch(`${API_URL}/halkaarz`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const list = await res.json();
    return list
      .filter((ipo: any) => ipo.symbol)
      .map((ipo: any) => ({
        symbol: ipo.symbol,
      }));
  } catch (err) {
    return [];
  }
}

// Dynamic SEO metadata generation
export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  const data = await getIpoDetail(symbol);
  if (!data || data.error) {
    return {
      title: `${symbol} Halka Arz Detayı Bulunamadı | ALBorsa`,
      description: `${symbol} sembolüne ait halka arz bilgileri bulunamadı.`,
    };
  }
  return {
    title: `${data.title} (${data.symbol}) Halka Arz Detayları & Analizi | ALBorsa`,
    description: `${data.title} (${data.symbol}) halka arz tarihi, fiyatı (${data.price}), lot dağıtım tahminleri, finansal tabloları ve fon kullanım alanları.`,
  };
}

export default async function HalkaArzDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  const data = await getIpoDetail(symbol);
  return <DetailClient symbol={symbol} data={data} />;
}
