import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Penda — AI Assistant",
  description:
    "Penda is a production-ready AI chat assistant with memory, tool-use, RAG, and BYOK Groq model support.",
  keywords: ["AI", "chatbot", "Groq", "LangGraph", "Penda"],
  openGraph: {
    title: "Penda — AI Assistant",
    description: "Your intelligent AI assistant with memory and tools.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
