import { useEffect, useState } from "react";
import { CreditCard, Plus, Loader2, Trash2, Radio, ExternalLink, AlertTriangle, X, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isNfcSupported, readNfcOnce, isInIframe } from "@/lib/nfcReader";
import { Capacitor } from "@capacitor/core";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface NfcTag {
  id: string;
  tag_uid: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

const AdminNfcTags = () => {
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cancelFn, setCancelFn] = useState<null | (() => void | Promise<void>)>(null);
  const [blockedByIframe, setBlockedByIframe] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("admin_nfc_tags")
      .select("*")
      .order("created_at", { ascending: false });
    setTags((data as NfcTag[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    isNfcSupported().then(setSupported);
    // Web NFC bloqueado quando estamos no preview (iframe) e não é o app nativo
    setBlockedByIframe(!Capacitor.isNativePlatform() && isInIframe());
    load();
  }, []);

  const startEnroll = async () => {
    if (!supported) {
      toast.error("NFC indisponível. Use o app Android ou abra fora do preview.");
      return;
    }
    // Pede o nome ANTES, pra UX ficar igual a uma maquininha:
    // confirma → mostra "aproxime" → lê → grava.
    const label = window.prompt("Nome para este crachá (ex: Crachá da carteira)", "Crachá");
    if (!label) return;

    setScanning(true);
    const session = readNfcOnce();
    setCancelFn(() => session.cancel);
    try {
      const uid = await session.uid;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sessão expirada");
        return;
      }
      const { error } = await supabase.from("admin_nfc_tags").insert({
        user_id: user.id,
        tag_uid: uid,
        label,
      });
      if (error) {
        if (error.code === "23505") toast.warning("Este crachá já está cadastrado.");
        else toast.error("Erro: " + error.message);
      } else {
        toast.success("Crachá NFC cadastrado!");
        load();
      }
    } catch (err: any) {
      if (err?.message) toast.error(err.message);
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

  const remove = async (id: string) => {
    if (!confirm("Remover este crachá?")) return;
    const { error } = await supabase.from("admin_nfc_tags").delete().eq("id", id);
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Crachá removido"); load(); }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-3 mb-1">
        <CreditCard className="w-5 h-5 text-primary" />
        <h3 className="font-bold">Crachás NFC</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Encoste um crachá NFC no celular para aprovar tentativas de login no admin
        sem precisar tocar em "Sou eu". Funciona no app Android.
      </p>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum crachá cadastrado.</p>
      ) : (
        <ul className="space-y-2">
          {tags.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 p-3 bg-background border border-border rounded"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.label || "Crachá"}</p>
                <p className="text-[11px] text-muted-foreground truncate font-mono">
                  UID {t.tag_uid}
                </p>
                {t.last_used_at && (
                  <p className="text-[11px] text-muted-foreground">
                    Último uso: {new Date(t.last_used_at).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(t.id)}
                className="p-2 rounded hover:bg-destructive/10 text-destructive transition-colors"
                title="Remover"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {blockedByIframe && (
        <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-2 min-w-0">
            <p className="text-xs font-semibold">Abra o app fora do preview</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              O leitor NFC do navegador só funciona quando o site está aberto
              direto, sem estar dentro do editor. Toque abaixo para abrir em
              nova aba e cadastre o crachá lá.
            </p>
            <button
              onClick={() => window.open(window.location.href, "_blank", "noopener")}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir em nova aba
            </button>
          </div>
        </div>
      )}

      {scanning ? (
        <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/30 flex flex-col items-center gap-3">
          <Radio className="w-8 h-8 text-primary animate-pulse" />
          <p className="text-sm font-semibold text-center">
            Encoste o crachá no celular agora…
          </p>
          <button
            onClick={cancelScan}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          onClick={startEnroll}
          disabled={!supported}
          className="mt-4 flex items-center gap-2 text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          {supported
            ? "Cadastrar novo crachá"
            : blockedByIframe
              ? "Disponível ao abrir em nova aba"
              : "NFC indisponível neste aparelho"}
        </button>
      )}
    </div>
  );
};

export default AdminNfcTags;
