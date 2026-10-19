import type { Metadata } from "next/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "TraceWreck — Debug the path, not just the output",
  description: "The flight recorder and root-cause debugger for AI agents. Inspect what happened, separate evidence from hypotheses, and simulate fixes."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body>{children}</body></html>;
}
