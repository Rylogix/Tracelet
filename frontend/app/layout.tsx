import "./globals.css";
import { AuthGate, RuntimeStatus, PrivacyCard } from "@/components/auth-gate";
import Link from "next/link";
import {
  Fingerprint,
  Search,
  SlidersHorizontal,
  Activity,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
export const metadata = {
  title: "Tracelet — follow the public trail",
  description:
    "A private workspace for public information. Local-first, free, and open source.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>
          <div className="app-shell">
            <aside>
              <Link href="/" className="brand">
                <span className="brand-icon">
                  <Fingerprint size={25} />
                </span>
                tracelet<span className="beta">OSINT</span>
              </Link>
              <div className="nav-label">WORKSPACE</div>
              <nav>
                <Link href="/">
                  <Search size={18} /> Investigate
                </Link>
                <Link href="/footprint">
                  <Fingerprint size={18} /> My digital footprint
                </Link>
                <Link href="/usage">
                  <Activity size={18} /> API usage
                </Link>
                <Link href="/settings/integrations">
                  <SlidersHorizontal size={18} /> Integrations
                </Link>
              </nav>
              <div className="aside-bottom">
                <ShieldCheck size={20} />
                <PrivacyCard />
                <a href="https://github.com" target="_blank" rel="noreferrer">
                  Open source by design <ArrowUpRight size={13} />
                </a>
              </div>
            </aside>
            <div className="workspace">
              <header>
                <span>
                  Workspace <span className="muted">/</span>{" "}
                  <strong>Tracelet</strong>
                </span>
                <RuntimeStatus />
              </header>
              <main>{children}</main>
              <footer>
                TRACELET <span>Public information. Clearer perspective.</span>
                <span>v0.1.0 · Open source</span>
              </footer>
            </div>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
