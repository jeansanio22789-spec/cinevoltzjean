import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Pricing from "./pages/Pricing.tsx";
import Admin from "./pages/Admin.tsx";
import Careers from "./pages/Careers.tsx";
import Login from "./pages/Login.tsx";
import NotFound from "./pages/NotFound.tsx";
import Live from "./pages/Live.tsx";
import Account from "./pages/Account.tsx";
import Watch from "./pages/Watch.tsx";
import ExternalView from "./pages/ExternalView.tsx";
import TestChannels from "./pages/TestChannels.tsx";
import ChannelView from "./pages/ChannelView.tsx";
import MaintenanceGate from "@/components/MaintenanceGate";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import UploadFloatingIndicator from "@/components/UploadFloatingIndicator";
import { useEffect } from "react";
import { installAudioUnlock } from "@/lib/audioUnlock";
import { initUploadQueue } from "@/hooks/useUploadQueue";


const queryClient = new QueryClient();

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
              <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
              <Route path="/teste-canais" element={<ProtectedRoute><TestChannels /></ProtectedRoute>} />
              <Route path="/c/:slug" element={<ChannelView />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <InstallAppPrompt />
          </MaintenanceGate>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
