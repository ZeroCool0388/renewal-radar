'use client';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from './ui/tooltip';
import { Toaster } from './ui/sonner';
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider delayDuration={150}>
        {children}
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
