import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Smartphone, KeyRound, CheckCircle2, Send, Film, Link as LinkIcon, AlertTriangle } from "lucide-react";

interface MtprotoStatus {
  configured: boolean;
  phone: string | null;
  updated_at: string | null;
}

const AdminTelegramImport = () => {
  const [status, setStatus] = useState<MtprotoStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Login state
  const [phone, setPhone] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Import state
  const [tgUrl, setTgUrl] = useState("");
  const [movieTitle, setMovieTitle] = useState("");
  const [movieDesc, setMovieDesc] = useState("");
  const [movieGenre, setMovieGenre] = useState("Ação");
  const [movieYear, setMovieYear] = useState<number>(new Date().getFullYear());
  const [movieThumb, setMovieThumb] = useState("");
  const [importing, setImporting] = useState(false);

  const loadStatus = async () => {
    setLoadingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke("tg-mtproto-status");
      if (error) throw error;
      setStatus(data as MtprotoStatus);
    } catch (e: any) {
      toast.error("Erro ao carregar status: " + e.message);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSendCode = async () => {
    if (!phone.startsWith("+")) {
      toast.error("Use formato internacional, ex: +5511999998888");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("tg-mtproto-send-code", {
        body: { phone },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPendingId(data.pending_id);
      toast.success("Código enviado! Abra o app Telegram e digite o código.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar código");
    } finally {
      setSending(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!pendingId || !code) return;
    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke("tg-mtproto-sign-in", {
        body: { pending_id: pendingId, code, password: password || undefined },
      });
      if (error) throw error;
      if (data?.error === "PASSWORD_REQUIRED") {
        setNeedsPassword(true);
        toast.info("Sua conta tem senha 2FA. Digite ela abaixo.");
        return;
      }
      if (data?.error) throw new Error(data.error);
      toast.success("MTProto conectado!");
      setPendingId(null);
      setCode("");
      setPassword("");
      setNeedsPassword(false);
      setPhone("");
      await loadStatus();
    } catch (e: any) {
      toast.error(e.message || "Erro ao confirmar código");
    } finally {
      setConfirming(false);
    }
  };

  const handleImport = async () => {
    if (!tgUrl || !movieTitle) {
      toast.error("Cole o link do Telegram e dê um título ao filme");
      return;
    }
    setImporting(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const streamUrl = `https://${projectId}.supabase.co/functions/v1/tg-mtproto-stream?url=${encodeURIComponent(tgUrl)}`;

      const { error } = await supabase.from("movies").insert({
        title: movieTitle,
        description: movieDesc,
        genre: movieGenre,
        year: movieYear,
        thumbnail_url: movieThumb || null,
        video_url: streamUrl,
        telegram_url: tgUrl,
        status: "published",
      });
      if (error) throw error;
      toast.success("Filme importado e publicado!");
      setTgUrl("");
      setMovieTitle("");
      setMovieDesc("");
      setMovieThumb("");
    } catch (e: any) {
      toast.error(e.message || "Erro ao importar");
    } finally {
      setImporting(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold">Importar do Telegram (MTProto)</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Conecte sua conta Telegram pessoal e importe filmes de canais privados — sem precisar baixar.
        </p>
      </div>

      {/* Status */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-3 mb-3">
          <Smartphone className="w-5 h-5 text-primary" />
          <h3 className="font-bold">Status da conexão</h3>
        </div>
        {status?.configured ? (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-accent" />
            <span>
              Conectado como <b>{status.phone}</b>
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta Telegram conectada. Faça login abaixo.
          </p>
        )}
      </div>

      {/* Login MTProto */}
      {!status?.configured && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-3">
            <KeyRound className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Login MTProto</h3>
          </div>

          <div className="bg-destructive/10 border border-destructive/30 rounded p-3 text-xs text-foreground flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
            <p>
              Use uma <b>conta secundária</b> (chip extra). O Telegram pode banir contas que automatizam.
              Essa conta precisa estar dentro do canal/grupo dos filmes.
            </p>
          </div>

          {!pendingId ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Telefone (com +55)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+5511999998888"
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <button
                onClick={handleSendCode}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded font-semibold text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? "Enviando..." : "Enviar código"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Código recebido no app Telegram
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="12345"
                  maxLength={6}
                  className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm tracking-widest text-center focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {needsPassword && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Senha 2FA
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="senha do Telegram"
                    className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setPendingId(null); setCode(""); setPassword(""); setNeedsPassword(false); }}
                  className="flex-1 bg-muted text-foreground py-2.5 rounded font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmCode}
                  disabled={confirming || !code}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded font-semibold text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Importar filme */}
      {status?.configured && (
        <div className="bg-card border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Importar filme</h3>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <LinkIcon className="w-3 h-3" /> Link do Telegram
            </label>
            <input
              type="url"
              value={tgUrl}
              onChange={(e) => setTgUrl(e.target.value)}
              placeholder="https://t.me/c/123456789/42"
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Copie o link da mensagem com o vídeo (canal privado: começa com /c/).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Título</label>
              <input
                value={movieTitle}
                onChange={(e) => setMovieTitle(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gênero</label>
              <input
                value={movieGenre}
                onChange={(e) => setMovieGenre(e.target.value)}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ano</label>
              <input
                type="number"
                value={movieYear}
                onChange={(e) => setMovieYear(parseInt(e.target.value) || 2025)}
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thumbnail (URL)</label>
              <input
                value={movieThumb}
                onChange={(e) => setMovieThumb(e.target.value)}
                placeholder="https://..."
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrição</label>
            <textarea
              value={movieDesc}
              onChange={(e) => setMovieDesc(e.target.value)}
              rows={3}
              className="w-full mt-1 px-3 py-2 bg-background border border-border rounded text-sm resize-none"
            />
          </div>

          <button
            onClick={handleImport}
            disabled={importing || !tgUrl || !movieTitle}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded font-semibold text-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
            {importing ? "Importando..." : "Importar e publicar"}
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminTelegramImport;
