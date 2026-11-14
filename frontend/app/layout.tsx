import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "./globals.css";
import { AuthGate } from "@/components/auth-gate";
import { WorkspaceShell } from "@/components/workspace-shell";
export const metadata = {
  title: "Tracelet — Free OSINT workspace",
  description:
    "Explore public information with real sources and a private workspace. Free and open source.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate>
          <WorkspaceShell>{children}</WorkspaceShell>
        </AuthGate>
      </body>
    </html>
  );
}
