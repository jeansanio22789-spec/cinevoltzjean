import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import MaintenanceGate from "@/components/MaintenanceGate";
import { Suspense, lazy, useEffect } from "react";
import { installAudioUnlock } from "@/lib/audioUnlock";
import { initUploadQueue } from "@/hooks/useUploadQueue";
import { useAutoUpdate } from "@/hooks/useAutoUpdate";

// Lazy: tudo que não é a Home entra sob demanda. Isso reduz drasticamente
// o número de scripts baixados no boot (antes ~160, várias páginas/admin).
const Pricing = lazy(() => import("./pages/Pricing.tsx"));
const Admin = lazy(() => import("./pages/Admin.tsx"));
const Careers = lazy(() => import("./pages/Careers.tsx"));
const Login = lazy(() => import("./pages/Login.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Live = lazy(() => import("./pages/Live.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const Watch = lazy(() => import("./pages/Watch.tsx"));
const ExternalView = lazy(() => import("./pages/ExternalView.tsx"));
const TestChannels = lazy(() => import("./pages/TestChannels.tsx"));
const ChannelView = lazy(() => import("./pages/ChannelView.tsx"));
const InstallAppPrompt = lazy(() => import("@/components/InstallAppPrompt"));
const UploadFloatingIndicator = lazy(
  () => import("@/components/UploadFloatingIndicator"),
);
const AppUpdateBanner = lazy(() => import("@/components/AppUpdateBanner"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache mais agressivo: evita refetch toda hora ao trocar de tela.
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  </div>
);

const App = () => {
  useEffect(() => {
    installAudioUnlock();
    // Garante que uploads em andamento continuem mesmo se o usuário sair
    // do painel admin ou recarregar o app.
    initUploadQueue();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <MaintenanceGate>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/inicio" element={<Index />} />
                  <Route path="/planos" element={<Pricing />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/carreiras" element={<Careers />} />
                  <Route path="/ao-vivo" element={<Live />} />
                  <Route path="/minha-conta" element={<Account />} />
                  <Route path="/assistir/:id" element={<Watch />} />
                  <Route path="/externo" element={<ExternalView />} />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <Admin />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/teste-canais"
                    element={
                      <ProtectedRoute>
                        <TestChannels />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/c/:slug" element={<ChannelView />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <Suspense fallback={null}>
                <AppUpdateBanner />
                <InstallAppPrompt />
                <UploadFloatingIndicator />
              </Suspense>
            </MaintenanceGate>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
