import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'EspIAdinha BBB',
  description: 'Acompanhe o BBB 26 com recortes do Canal Espiadinha - BBB 26, filtros por participante, resumo e favoritos.',
  applicationName: 'EspIAdinha BBB',
  keywords: ['BBB 26', 'Big Brother Brasil', 'reality show', 'feed BBB', 'participantes BBB'],
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
  openGraph: {
    title: 'EspIAdinha BBB',
    description: 'Um jeito mais agradável de acompanhar os recortes, reações e participantes em destaque no BBB 26.',
    siteName: 'EspIAdinha BBB',
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EspIAdinha BBB',
    description: 'Feed, resumo e favoritos para acompanhar o BBB 26 de forma rápida.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#07080d',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-indigo-500/30`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}