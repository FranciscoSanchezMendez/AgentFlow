import type { Metadata, Viewport } from 'next';
import { DM_Sans, Space_Grotesk } from 'next/font/google';
import './globals.css';

const body = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'], display: 'swap' });

export const metadata: Metadata = {
  title: 'AgentFlow · Equipo multiagente',
  description: 'Orchestrator, Develop y Testing colaboran para planificar, implementar y verificar tareas de desarrollo.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0e13',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${body.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
