import type { Metadata } from "next/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceWreck — The flight recorder and root-cause debugger for AI agents",
  description: "Trace AI-agent failures, inspect decision paths, and simulate fixes."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body>{children}</body></html>;
}
