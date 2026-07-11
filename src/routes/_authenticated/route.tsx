import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationsBell } from "@/components/notifications-bell";
import { SuperAdminToggle } from "@/components/super-admin-toggle";
import { useMyBan } from "@/hooks/use-my-ban";
import { BannedScreen } from "@/components/banned-screen";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { ban, loading: banLoading } = useMyBan();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session || banLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (ban) {
    return <BannedScreen ban={ban} />;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="h-12 flex items-center gap-2 border-b px-3 sticky top-0 bg-background z-10">
          <SidebarTrigger />
          <div className="ml-auto flex items-center gap-2">
            <SuperAdminToggle />
            <NotificationsBell />
          </div>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}