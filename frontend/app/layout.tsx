import "@fontsource-variable/inter";
import "./globals.css";
import { AuthGate } from "@/components/auth-gate";
import { WorkflowProvider } from "@/components/workflow";
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
          <WorkflowProvider><WorkspaceShell>{children}</WorkspaceShell></WorkflowProvider>
        </AuthGate>
      </body>
    </html>
  );
}
