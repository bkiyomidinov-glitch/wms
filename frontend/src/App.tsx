import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, type AppRoute } from "@/components/layout/AppShell";
import { AuthProvider, useAuth } from "@/lib/auth";
import { DirectoryPage } from "@/pages/DirectoryPage";
import { JournalPage } from "@/pages/JournalPage";
import { LoginPage } from "@/pages/LoginPage";
import { MovementsPage } from "@/pages/MovementsPage";
import { TerminalPage } from "@/pages/TerminalPage";
import { WarehousesOverviewPage } from "@/pages/WarehousesOverviewPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function CoreWorkspace() {
  const { user, isLoading } = useAuth();
  const [route, setRoute] = useState<AppRoute>("terminal");

  useEffect(() => {
    if (!user) return;
    // Default to first accessible route
    if (user.role === "SUPER_ADMIN" || user.permissions?.can_inbound || user.permissions?.can_outbound) {
      setRoute("terminal");
    } else if (user.permissions?.can_view_stock) {
      setRoute("warehouses");
    } else if (user.permissions?.can_view_movements) {
      setRoute("movements");
    } else {
      setRoute("history");
    }
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-sm font-medium text-[#64748B]">
          Загрузка WMS Core...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderPage = () => {
    if (route === "warehouses") {
      return <WarehousesOverviewPage />;
    }
    if (route === "movements") {
      return <MovementsPage />;
    }
    if (route === "directory") {
      return <DirectoryPage />;
    }
    if (route === "products") {
      return <DirectoryPage initialTab="products" />;
    }
    if (route === "stores") {
      return <DirectoryPage initialTab="stores" />;
    }
    if (route === "users") {
      return <DirectoryPage initialTab="users" />;
    }
    if (route === "history") {
      return <JournalPage />;
    }
    return <TerminalPage onNavigate={setRoute} />;
  };

  return (
    <AppShell activeRoute={route} onNavigate={setRoute}>
      {renderPage()}
    </AppShell>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CoreWorkspace />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
