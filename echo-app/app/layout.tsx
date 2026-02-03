import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Playfair_Display, Space_Mono } from "next/font/google";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ToastProvider } from "@/components/ui";
import "./globals.css";

// 正文字体 - 无衬线体
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Logo/标题字体 - 衬线体
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

// 等宽字体 - 用于时间、标签、元数据（打印机风格）
const spaceMono = Space_Mono({
  weight: ["400", "700"],
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Echo - Less noise, more signal",
  description: "极简即时通讯，回归纯粹沟通",
  applicationName: "Echo",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Echo",
  },
};

// 移动端视口配置
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0F0F' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeScript = `(() => {
  try {
    const saved = localStorage.getItem('echo-theme');
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (systemDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch {}
})();`;

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body
        className={`${inter.variable} ${playfair.variable} ${spaceMono.variable} font-serif antialiased bg-[#F2F0E9] dark:bg-[#121212] text-[#1A1A1A] dark:text-[#E0E0E0]`}
      >
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
