import "./globals.css";

export const metadata = {
  title: "LA Court Watch",
  description: "Aggregated tennis court availability for Los Angeles."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
