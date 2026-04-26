import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Verifica se o usuário está banido — se sim, faz signOut.
  // IMPORTANTE: só desloga se a query confirmar "Banido". Erro de rede/timeout
  // NÃO desloga (evita o "desconectar toda hora" em conexões instáveis).
  const enforceBan = async (u: User | null) => {
    if (!u) return;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", u.id)
        .maybeSingle();
      if (error) return; // falha de rede → ignora, não desloga
      if (data?.status === "Banido") {
        toast.error("Sua conta foi banida. Entre em contato com o suporte.");
        await supabase.auth.signOut();
      }
    } catch {
      // qualquer exceção: mantém logado
    }
  };

  useEffect(() => {
    // 1) Pega a sessão atual primeiro (sync com localStorage) pra evitar flicker
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) void enforceBan(session.user);
    });

    // 2) Escuta mudanças. Só roda enforceBan em eventos que realmente importam
    //    (login novo / troca de usuário). TOKEN_REFRESHED e USER_UPDATED não
    //    precisam re-checar ban — evita queries desnecessárias e desconexões
    //    falsas quando a query falha.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (event === "SIGNED_IN" && session?.user) {
        void enforceBan(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) {
        await supabase.from("audit_logs").insert({
          user_id: u.id,
          user_email: u.email,
          action: "logout",
          resource_type: "auth",
          description: `Usuário ${u.email} fez logout`,
        });
      }
    } catch { /* silent */ }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
