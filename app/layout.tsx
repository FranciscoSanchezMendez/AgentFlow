import type { Metadata, Viewport } from 'next';
import './globals.css';

// Se usan fuentes del sistema (definidas en globals.css) para que la compilación
// no dependa de descargar fuentes de Google en tiempo de build.

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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
