import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ShieldAlert, Check, X, Smartphone, Clock, CreditCard, Radio } from "lucide-react";
import { toast } from "sonner";
import { isNfcSupported, readNfcOnce } from "@/lib/nfcReader";

interface LoginRequest {
  id: string;
  device_id: string;
  device_label: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
  expires_at: string;
}

/**
 * Componente global que escuta solicitações de login pendentes do admin
 * e mostra um modal pedindo aprovação no celular cadastrado.
 *
 * Deve ficar montado em qualquer lugar onde o admin esteja logado (ex: App.tsx).
 */
const LoginApprovalGate = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [pending, setPending] = useState<LoginRequest | null>(null);
  const [acting, setActing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [nfcAvailable, setNfcAvailable] = useState(false);
  const [scanningNfc, setScanningNfc] = useState(false);
  const [nfcCancel, setNfcCancel] = useState<null | (() => void | Promise<void>)>(null);

  // Carrega solicitações pendentes existentes ao logar
  useEffect(() => {
    if (!user || !isAdmin) {
      setPending(null);
      return;
    }
    const loadPending = async () => {
      const { data } = await supabase
        .from("login_requests")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setPending(data as LoginRequest);
    };
    loadPending();
  }, [user, isAdmin]);

  // Realtime: escuta novas solicitações
  useEffect(() => {
    if (!user || !isAdmin) return;
    const channel = supabase
      .channel(`login-req-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "login_requests",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const req = payload.new as LoginRequest;
          if (req.status === "pending") {
            setPending(req);
            // Vibra + som se possível
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            toast.warning("Nova tentativa de login no seu admin!");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAdmin]);

  // Timer regressivo
  useEffect(() => {
    if (!pending) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(pending.expires_at).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff === 0) setPending(null);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [pending]);

  // Detecta suporte NFC e auto-inicia leitura quando há pendente
  useEffect(() => {
    isNfcSupported().then(setNfcAvailable);
  }, []);

  const decide = async (decision: "approve" | "deny") => {
    if (!pending) return;
    setActing(true);
    const { data, error } = await supabase.rpc("decide_admin_login", {
      _request_id: pending.id,
      _decision: decision,
    });
    setActing(false);
    if (error) {
      toast.error("Erro ao processar decisão.");
      return;
    }
    const result = data as { ok: boolean; status?: string; reason?: string };
    if (result.ok) {
      toast.success(decision === "approve" ? "Acesso liberado!" : "Acesso negado.");
      setPending(null);
    } else {
      toast.error(`Falha: ${result.reason}`);
    }
  };

  const approveWithNfc = async () => {
    if (!pending) return;
    setScanningNfc(true);
    const session = readNfcOnce();
    setNfcCancel(() => session.cancel);
    try {
      const uid = await session.uid;
      setActing(true);
      const { data, error } = await supabase.rpc("approve_admin_login_with_nfc", {
        _request_id: pending.id,
        _tag_uid: uid,
      });
      setActing(false);
      if (error) {
        toast.error("Erro ao validar crachá.");
        return;
      }
      const result = data as { ok: boolean; reason?: string };
      if (result.ok) {
        toast.success("Liberado pelo crachá NFC!");
        setPending(null);
      } else if (result.reason === "unknown_tag") {
        toast.error("Crachá não reconhecido. Cadastre primeiro em Configurações.");
      } else {
        toast.error(`Falha: ${result.reason}`);
      }
    } catch (err: any) {
      if (err?.message) toast.error(err.message);
    } finally {
      setScanningNfc(false);
      setNfcCancel(null);
    }
  };

  const cancelNfc = async () => {
    if (nfcCancel) await nfcCancel();
    setScanningNfc(false);
    setNfcCancel(null);
  };

  if (!pending) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <Dialog open={true} onOpenChange={() => { /* não permite fechar sem decidir */ }}>
      <DialogContent className="max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <DialogTitle className="text-center text-xl">Tentativa de login detectada</DialogTitle>
          <DialogDescription className="text-center">
            Alguém está tentando entrar no painel admin de um aparelho novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Smartphone className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-semibold truncate">{pending.device_label || "Dispositivo desconhecido"}</span>
            </div>
            {pending.user_agent && (
              <p className="text-[11px] text-muted-foreground break-words leading-snug">
                {pending.user_agent}
              </p>
            )}
            <div className="flex items-center gap-1.5 text-xs text-amber-500">
              <Clock className="w-3.5 h-3.5" />
              Expira em {mins}:{secs.toString().padStart(2, "0")}
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Se não foi você, <b>negue imediatamente</b> e troque sua senha.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => decide("deny")}
            disabled={acting || scanningNfc}
            className="flex items-center justify-center gap-2 py-3 rounded-lg bg-destructive text-destructive-foreground font-semibold text-sm hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" /> Não fui eu
          </button>
          <button
            onClick={() => decide("approve")}
            disabled={acting || scanningNfc}
            className="flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Sou eu, liberar
          </button>
        </div>

        {nfcAvailable && (
          <div className="mt-2">
            {scanningNfc ? (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 flex flex-col items-center gap-2">
                <Radio className="w-6 h-6 text-primary animate-pulse" />
                <p className="text-xs font-semibold text-center">
                  Encoste o crachá NFC no celular…
                </p>
                <button
                  onClick={cancelNfc}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Cancelar leitura
                </button>
              </div>
            ) : (
              <button
                onClick={approveWithNfc}
                disabled={acting}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-accent text-accent-foreground font-semibold text-sm hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" /> Aprovar com crachá NFC
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LoginApprovalGate;
