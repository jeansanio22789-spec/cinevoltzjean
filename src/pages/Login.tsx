import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, LogIn, UserPlus, CreditCard, Wifi, X, Loader2, Check, ShieldCheck } from "lucide-react";
import { logAudit } from "@/lib/auditLog";
import { supabase } from "@/integrations/supabase/client";
import { isNfcSupported, readNfcOnce } from "@/lib/nfcReader";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
// sr-only wrapper replaces VisuallyHidden
import { toast } from "sonner";

const normalizeUid = (uid: string) => uid.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
const prettyUid = (uid: string) => normalizeUid(uid).match(/.{1,2}/g)?.join(":") ?? normalizeUid(uid);

const Login = () => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  // Modo: "client" = sem crachá, "admin" = exige crachá obrigatório
  const [mode, setMode] = useState<"client" | "admin">("client");
  const [nfcSupported, setNfcSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Quando true, o scan está rodando "no fundo" — não abre o modal grande.
  // Quando false e scanning=true, o usuário tocou no botão → mostra modal.
  const [silentScan, setSilentScan] = useState(true);
  const [cancelFn, setCancelFn] = useState<null | (() => void | Promise<void>)>(null);
  // Token NFC validado, será consumido após o login com senha
  const [nfcToken, setNfcToken] = useState<string | null>(null);
  // UID lido de um crachá novo: salva automaticamente depois do login admin.
  const [pendingEnrollUid, setPendingEnrollUid] = useState<string | null>(null);
  // Trigger pra reiniciar o scan automático após erro/falha
  const [autoScanTick, setAutoScanTick] = useState(0);

  useEffect(() => {
    isNfcSupported().then((ok) => {
      setNfcSupported(ok);
    });
  }, []);

  // Escuta NFC em background sempre que estamos na tela de login,
  // sem token validado e sem estar no cadastro. Modo "silencioso":
  // o admin só encosta o crachá e o app entra sozinho.
  useEffect(() => {
    if (!nfcSupported) return;
    if (nfcToken) return;
    if (scanning) return;
    if (isSignUp) return;
    if (pendingEnrollUid) return;
    void startNfcScan({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nfcSupported, nfcToken, scanning, isSignUp, pendingEnrollUid, autoScanTick]);

  const startNfcScan = async (opts: { silent?: boolean } = {}) => {
    if (!nfcSupported) {
      toast.error("NFC indisponível. Use o app Android ou abra o site fora do preview.");
      return;
    }
    setSilentScan(!!opts.silent);
    setScanning(true);
    const session = readNfcOnce();
    setCancelFn(() => session.cancel);
    try {
      const uid = await session.uid;

      // 1) Tenta login direto via edge function (tap-to-login, sem senha)
      const { data: loginData, error: loginErr } = await supabase.functions.invoke("nfc-login", {
        body: { tag_uid: uid },
      });

      if (!loginErr && loginData?.ok && loginData?.session) {
        const { error: setErr } = await supabase.auth.setSession({
          access_token: loginData.session.access_token,
          refresh_token: loginData.session.refresh_token,
        });
        if (!setErr) {
          await logAudit({
            action: "login",
            resource_type: "auth",
            description: `Admin ${loginData.email} entrou via crachá NFC (tap-to-login)`,
            metadata: { email: loginData.email, nfc: true, auto: true },
          });
          toast.success("Bem-vindo! Entrando no painel...");
          navigate(redirectParam || "/admin");
          return;
        }
      }

      // 2) Crachá desconhecido → fluxo de cadastro (login com senha + insert)
      const reason = loginData?.reason as string | undefined;
      if (reason === "unknown_tag") {
        const normalized = normalizeUid(uid);
        setPendingEnrollUid(normalized);
        setNfcToken(null);
        setMode("client");
        setError(`Crachá novo lido (${prettyUid(normalized)}). Entre com email e senha admin para salvar.`);
        toast.warning("Crachá novo lido. Faça login admin para cadastrar automaticamente.");

        // Notifica admins sobre o aparelho desconhecido tentando entrar
        await supabase.functions.invoke("notify-unknown-device", {
          body: { tag_uid: normalized, user_agent: navigator.userAgent },
        }).catch(() => {});
        return;
      }
      if (reason === "not_admin") {
        toast.error("Este crachá não pertence a um administrador.");
        return;
      }

      // 3) Fallback: fluxo antigo (NFC + senha) caso edge function caia
      const { data, error: rpcError } = await supabase.rpc("issue_admin_nfc_challenge", {
        _tag_uid: uid,
      });
      if (rpcError) {
        toast.error("Erro ao validar crachá.");
        return;
      }
      const result = data as { ok: boolean; email?: string; token?: string; reason?: string };
      if (!result.ok) {
        toast.error("Falha ao validar crachá.");
        return;
      }
      setPendingEnrollUid(null);
      setEmail(result.email!);
      setNfcToken(result.token!);
      toast.success("Crachá validado. Agora informe a senha.");
      setTimeout(() => {
        document.querySelector<HTMLInputElement>("input[name='admin-password']")?.focus();
      }, 100);
    } catch (err: any) {
      // Em scan silencioso, não enche a tela com toasts; só reagenda
      if (!opts.silent && err?.message) toast.error(err.message);
      // Reagenda nova tentativa silenciosa após pequeno delay
      if (opts.silent) {
        setTimeout(() => setAutoScanTick((t) => t + 1), 1500);
      }
    } finally {
      setScanning(false);
      setCancelFn(null);
    }
  };

  const cancelScan = async () => {
    if (cancelFn) await cancelFn();
    setScanning(false);
    setCancelFn(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "admin" && !isSignUp && !nfcToken) {
      setError("Aproxime o crachá NFC antes de entrar.");
      return;
    }

    setLoading(true);

    if (isSignUp) {
      const { error } = await signUp(email, password);
      if (error) setError(error.message);
      else {
        setSuccess("Conta criada! Verifique seu email ou faça login.");
        setIsSignUp(false);
      }
      setLoading(false);
      return;
    }

    const { error: signErr } = await signIn(email, password);
    if (signErr) {
      setError("Email ou senha inválidos.");
      setLoading(false);
      return;
    }

    const { data: { user: signedUser } } = await supabase.auth.getUser();
    const { data: signedUserIsAdmin } = signedUser ? await supabase.rpc("is_admin") : { data: false };

    if (pendingEnrollUid) {
      if (!signedUser || !signedUserIsAdmin) {
        setError("Só administrador pode cadastrar crachá NFC.");
        setLoading(false);
        return;
      }

      const { error: enrollError } = await supabase.from("admin_nfc_tags").insert({
        user_id: signedUser.id,
        tag_uid: pendingEnrollUid,
        label: "Crachá principal",
      });

      if (enrollError) {
        if (enrollError.code === "23505") {
          toast.warning("Este crachá já estava cadastrado.");
        } else {
          setError("Não foi possível salvar o crachá: " + enrollError.message);
          setLoading(false);
          return;
        }
      } else {
        toast.success("Crachá cadastrado. Próximas entradas serão por NFC + senha.");
      }
      setPendingEnrollUid(null);
    }

    // Se modo admin, valida o crachá NO SERVIDOR depois do login
    if (mode === "admin") {
      const { data, error: rpcError } = await supabase.rpc("consume_admin_nfc_challenge", {
        _token: nfcToken!,
      });
      const ok = !rpcError && (data as { ok: boolean })?.ok;
      if (!ok) {
        await supabase.auth.signOut();
        setError("Falha na validação do crachá. Faça tudo de novo.");
        setNfcToken(null);
        setLoading(false);
        return;
      }
    }

    await logAudit({
      action: "login",
      resource_type: "auth",
      description: `Usuário ${email} entrou na plataforma${mode === "admin" ? " (com crachá NFC)" : ""}`,
      metadata: { email, nfc: mode === "admin" },
    });

    let destination = redirectParam;
    if (!destination) {
      destination = signedUser && signedUserIsAdmin ? "/admin" : "/";
    }
    navigate(destination);
    setLoading(false);
  };

  const switchMode = (m: "client" | "admin") => {
    setMode(m);
    setError("");
    setNfcToken(null);
    setPendingEnrollUid(null);
    if (m === "client") setEmail("");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-primary font-black text-3xl tracking-tight mb-2">STREAMFLIX</p>
          <p className="text-muted-foreground text-sm">
            {isSignUp ? "Crie sua conta gratuita" : "Acesse sua conta"}
          </p>
        </div>

        {/* Seletor de modo */}
        {!isSignUp && (
          <div className="grid grid-cols-2 gap-1 p-1 bg-muted/40 rounded-lg mb-4">
            <button
              type="button"
              onClick={() => switchMode("client")}
              className={`py-2 rounded-md text-xs font-semibold transition-colors ${
                mode === "client" ? "bg-card text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Cliente
            </button>
            <button
              type="button"
              onClick={() => switchMode("admin")}
              className={`py-2 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
                mode === "admin" ? "bg-card text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Admin
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-4">
          {/* Bloco do crachá só aparece em modo admin */}
          {mode === "admin" && !isSignUp && (
            <div className={`p-3 rounded-lg border ${nfcToken ? "bg-accent/10 border-accent/40" : "bg-primary/5 border-primary/30"}`}>
              {nfcToken ? (
                <div className="flex items-center gap-2 text-sm text-accent">
                  <Check className="w-4 h-4" />
                  <span className="font-semibold">Crachá validado</span>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-primary" /> Passo 1 — Crachá NFC
                  </p>
                  <button
                    type="button"
                    onClick={() => startNfcScan({ silent: false })}
                    disabled={!nfcSupported}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CreditCard className="w-4 h-4" />
                    {nfcSupported ? "Aproximar crachá" : "NFC indisponível"}
                  </button>
                  {!nfcSupported && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      Use o app Android ou abra a página fora do preview.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {pendingEnrollUid && !isSignUp && (
            <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 space-y-1">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" /> Crachá novo detectado
              </p>
              <p className="text-[11px] text-muted-foreground font-mono break-all">
                UID {prettyUid(pendingEnrollUid)}
              </p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Entre com email e senha de admin para cadastrar esse crachá automaticamente.
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              {mode === "admin" && !isSignUp ? "Passo 2 — Email" : "Email"}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={mode === "admin" && !isSignUp && !!nfcToken}
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-70"
              placeholder="admin@streamflix.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              {mode === "admin" && !isSignUp ? "Passo 3 — Senha" : "Senha"}
            </label>
            <div className="relative">
              <input
                name="admin-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={mode === "admin" && !isSignUp && !nfcToken}
                className="w-full px-3 py-2 pr-10 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={mode === "admin" && !nfcToken ? "Aproxime o crachá primeiro" : "••••••••"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && <p className="text-destructive text-xs font-medium">{error}</p>}
          {success && <p className="text-accent text-xs font-medium">{success}</p>}

          <button
            type="submit"
            disabled={loading || (mode === "admin" && !isSignUp && !nfcToken)}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            {loading ? "Aguarde..." : isSignUp ? "Criar Conta" : "Entrar"}
          </button>

          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccess(""); setNfcToken(null); setPendingEnrollUid(null); }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isSignUp ? "Já tem conta? Faça login" : "Não tem conta? Cadastre-se"}
          </button>

          {mode === "admin" && !isSignUp && (
            <div className="pt-3 border-t border-border">
              <button
                type="button"
                onClick={async () => {
                  await cancelScan();
                  toast.info("Entre com email e senha. Depois vá em Sistema → Crachás NFC.");
                  switchMode("client");
                }}
                className="w-full flex items-center justify-center gap-2 text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Cadastrar novo crachá
              </button>
              <p className="text-[10px] text-muted-foreground text-center mt-1.5 leading-snug">
                Requer login admin com email e senha primeiro
              </p>
            </div>
          )}
        </form>
      </div>

      {/* Modal "maquininha" pedindo o crachá */}
      <Dialog open={scanning} onOpenChange={(o) => { if (!o) cancelScan(); }}>
        <DialogContent
          className="max-w-sm border-primary/40 bg-gradient-to-b from-card to-background"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <span className="sr-only">
            <DialogTitle>Leitura de crachá NFC</DialogTitle>
            <DialogDescription>
              Aproxime o crachá NFC da parte de trás do celular para entrar.
            </DialogDescription>
          </span>
          <div className="flex flex-col items-center text-center py-4 space-y-5">
            <p className="text-[10px] uppercase tracking-[0.25em] text-primary font-bold">
              Aguardando crachá
            </p>

            <div className="relative w-40 h-40 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/15 animate-ping" />
              <div className="absolute inset-4 rounded-full bg-primary/20 animate-ping [animation-delay:200ms]" />
              <div className="absolute inset-8 rounded-full bg-primary/25 animate-ping [animation-delay:400ms]" />
              <div className="relative w-24 h-24 rounded-full bg-primary/90 flex items-center justify-center shadow-2xl shadow-primary/40">
                <Wifi className="w-12 h-12 text-primary-foreground rotate-90" />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-black">Aproxime o crachá</h3>
              <p className="text-sm text-muted-foreground">
                Encoste ou passe o cartão NFC<br />na parte de trás do celular
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Lendo…
            </div>

            <div className="w-full pt-2 border-t border-border/50 space-y-2">
              <button
                onClick={async () => {
                  await cancelScan();
                  toast.info("Entre com email e senha. Depois vá em Sistema → Crachás NFC.");
                  switchMode("client");
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Cadastrar novo crachá
              </button>
              <button
                onClick={cancelScan}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;
