import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, type AppRoute } from "@/components/layout/AppShell";
import { AuthProvider, useAuth } from "@/lib/auth";
import { JournalPage } from "@/pages/JournalPage";
import { LoginPage } from "@/pages/LoginPage";
import { ProductsCatalogPage } from "@/pages/ProductsCatalogPage";
import { TerminalPage } from "@/pages/TerminalPage";
import { UsersPage } from "@/pages/UsersPage";

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
  const { user, isLoading, hasRole } = useAuth();
  const [route, setRoute] = useState<AppRoute>("terminal");

  useEffect(() => {
    setRoute("terminal");
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
    if (route === "history" && hasRole("MANAGER", "DIRECTOR", "SUPER_ADMIN")) {
      return <JournalPage />;
    }
    if (route === "products" && hasRole("MANAGER", "DIRECTOR", "SUPER_ADMIN")) {
      return <ProductsCatalogPage />;
    }
    if (route === "users" && hasRole("MANAGER", "DIRECTOR", "SUPER_ADMIN")) {
      return <UsersPage />;
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
