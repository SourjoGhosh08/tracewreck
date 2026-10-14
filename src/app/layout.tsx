import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentPostmortem — Agent run observability",
  description: "Flight recorder and root-cause debugger for AI agents"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body>{children}</body></html>;
}
