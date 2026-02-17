import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Providers from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kivi Media Boards',
  description: 'Project management for Kivi Media',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('unhandledrejection', function(e) {
                if (e.reason && e.reason.name === 'AbortError') {
                  e.preventDefault();
                  e.stopImmediatePropagation();
                  return false;
                }
              });
            `,
          }}
        />
      </head>
      <body className="font-body">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
