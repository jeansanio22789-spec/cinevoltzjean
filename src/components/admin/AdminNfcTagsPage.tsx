import { useEffect, useMemo, useState } from "react";
import {
  CreditCard, Plus, Loader2, Trash2, Wifi, X, AlertTriangle,
  ExternalLink, Check, ShieldAlert, Pencil, Save, RefreshCw, Smartphone,
} from "lucide-react";
import { z } from "zod";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { isNfcSupported, readNfcOnce, isInIframe } from "@/lib/nfcReader";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { logAudit } from "@/lib/auditLog";

interface NfcTag {
  id: string;
  tag_uid: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
}

const labelSchema = z
  .string()
  .trim()
  .min(2, { message: "Dê um nome com pelo menos 2 caracteres." })
  .max(60, { message: "Nome muito longo (máx. 60)." });

// UID NFC: hex puro, 8 a 32 caracteres (4 a 16 bytes — cobre Mifare, NTAG, etc.)
const uidSchema = z
  .string()
  .regex(/^[0-9A-F]{8,32}$/i, { message: "UID inválido. Esperado 4 a 16 bytes em hex." });

/** Normaliza um UID lido pelo leitor: remove separadores e força maiúsculas. */
const normalizeUid = (raw: string) =>
  (raw || "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();

/** Formata um UID em pares de bytes (ex: "5C:13:FB:A2") apenas para exibição. */
const prettyUid = (uid: string) =>
  normalizeUid(uid).match(/.{1,2}/g)?.join(":") ?? uid;

const AdminNfcTagsPage = () => {
  const [tags, setTags] = useState<NfcTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [supported, setSupported] = useState(false);
  const [blockedByIframe, setBlockedByIframe] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  // Fluxo do cadastro
  const [scanning, setScanning] = useState(false);
  const [cancelFn, setCancelFn] = useState<null | (() => void | Promise<void>)>(null);
  const [previewUid, setPreviewUid] = useState<string>("");
  const [previewLabel, setPreviewLabel] = useState<string>("Crachá");
  const [savingPreview, setSavingPreview] = useState(false);

  // Edição inline do label
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>("");

  // Form errors
  const [labelError, setLabelError] = useState<string | null>(null);
  const [uidError, setUidError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_nfc_tags")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar crachás.");
    setTags((data as NfcTag[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    isNfcSupported().then(setSupported);
    setBlockedByIframe(!isNative && isInIframe());
    load();
  }, [isNative]);

  // Verificações em tempo real do que o usuário tá digitando
  useEffect(() => {
    if (!previewUid) { setUidError(null); return; }
    const r = uidSchema.safeParse(previewUid);
    setUidError(r.success ? null : r.error.issues[0]?.message ?? "UID inválido.");
  }, [previewUid]);

  useEffect(() => {
    if (!previewLabel) { setLabelError(null); return; }
    const r = labelSchema.safeParse(previewLabel);
    setLabelError(r.success ? null : r.error.issues[0]?.message ?? null);
  }, [previewLabel]);

  // Marca duplicados pra avisar antes de salvar
  const duplicate = useMemo(() => {
    if (!previewUid) return null;
    return tags.find((t) => normalizeUid(t.tag_uid) === normalizeUid(previewUid)) || null;
  }, [previewUid, tags]);

  const startScan = async () => {
    if (!supported) {
      toast.error("NFC indisponível neste navegador. Use o app Android.");
      return;
    }
    setPreviewUid("");
    setUidError(null);
    setScanning(true);
    const session = readNfcOnce();
    setCancelFn(() => session.cancel);
    try {
      const uid = await session.uid;
      const normalized = normalizeUid(uid);
      setPreviewUid(normalized);
      // Vibra + som suave de feedback (PWA)
      if (navigator.vibrate) navigator.vibrate(80);
      toast.success(`Crachá lido: ${prettyUid(normalized)}`);
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

  const resetPreview = () => {
    setPreviewUid("");
    setPreviewLabel("Crachá");
    setUidError(null);
    setLabelError(null);
  };

  const savePreview = async () => {
    // Valida tudo no cliente antes
    const lbl = labelSchema.safeParse(previewLabel);
    const uid = uidSchema.safeParse(previewUid);
    if (!lbl.success) { setLabelError(lbl.error.issues[0]?.message ?? null); return; }
    if (!uid.success) { setUidError(uid.error.issues[0]?.message ?? null); return; }
    if (duplicate) {
      toast.warning(`Este crachá já está cadastrado como "${duplicate.label || "sem nome"}".`);
      return;
    }

    setSavingPreview(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSavingPreview(false);
      toast.error("Sessão expirada.");
      return;
    }
    const normalizedUid = normalizeUid(previewUid);
    const cleanLabel = lbl.data;
    const { error } = await supabase.from("admin_nfc_tags").insert({
      user_id: user.id,
      tag_uid: normalizedUid,
      label: cleanLabel,
    });
    setSavingPreview(false);
    if (error) {
      if (error.code === "23505") toast.warning("Crachá já cadastrado.");
      else toast.error("Erro ao salvar: " + error.message);
      return;
    }
    await logAudit({
      action: "create",
      resource_type: "settings",
      description: `Crachá NFC "${cleanLabel}" cadastrado`,
      metadata: { type: "admin_nfc_tag", tag_uid: normalizedUid, label: cleanLabel },
    });
    toast.success("Crachá cadastrado!");
    resetPreview();
    load();
  };

  const remove = async (tag: NfcTag) => {
    if (!confirm(`Remover o crachá "${tag.label || prettyUid(tag.tag_uid)}"?`)) return;
    const { error } = await supabase.from("admin_nfc_tags").delete().eq("id", tag.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    await logAudit({
      action: "delete",
      resource_type: "settings",
      description: `Crachá NFC "${tag.label || tag.tag_uid}" removido`,
      metadata: { type: "admin_nfc_tag", tag_uid: tag.tag_uid },
    });
    toast.success("Crachá removido.");
    load();
  };

  const startEditLabel = (tag: NfcTag) => {
    setEditingId(tag.id);
    setEditingLabel(tag.label || "");
  };

  const saveEditLabel = async (tag: NfcTag) => {
    const r = labelSchema.safeParse(editingLabel);
    if (!r.success) { toast.error(r.error.issues[0]?.message ?? "Nome inválido."); return; }
    const { error } = await supabase
      .from("admin_nfc_tags")
      .update({ label: r.data })
      .eq("id", tag.id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Nome atualizado.");
    setEditingId(null);
    setEditingLabel("");
    load();
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho explicativo */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-lg">Crachás NFC</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Cadastre um cartão ou pulseira NFC para usar como segundo fator no
              login do admin (junto com email + senha) e para aprovar tentativas
              de login em novos dispositivos.
            </p>
          </div>
        </div>

        {/* Status do dispositivo */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className={`rounded p-3 border ${isNative ? "bg-accent/10 border-accent/40" : "bg-muted/30 border-border"}`}>
            <p className="font-semibold flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" /> App nativo
            </p>
            <p className="text-muted-foreground mt-1">
              {isNative ? "Sim — leitura NFC via plugin" : "Não (web)"}
            </p>
          </div>
          <div className={`rounded p-3 border ${supported ? "bg-accent/10 border-accent/40" : "bg-amber-500/10 border-amber-500/30"}`}>
            <p className="font-semibold flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" /> NFC disponível
            </p>
            <p className="text-muted-foreground mt-1">
              {supported ? "Pronto para ler" : "Indisponível"}
            </p>
          </div>
          <div className={`rounded p-3 border ${blockedByIframe ? "bg-destructive/10 border-destructive/30" : "bg-muted/30 border-border"}`}>
            <p className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Iframe
            </p>
            <p className="text-muted-foreground mt-1">
              {blockedByIframe ? "Bloqueado pelo preview" : "OK"}
            </p>
          </div>
        </div>

        {blockedByIframe && (
          <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-xs font-semibold">NFC bloqueado dentro do preview</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                O Chrome só libera Web NFC em uma aba principal. Você está dentro
                do editor (iframe). Abra o link abaixo numa aba normal do Chrome
                Android — ou use o app instalado.
              </p>
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Abrir em nova aba
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Cadastro com pré-visualização */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <Plus className="w-4 h-4 text-primary" />
          <h3 className="font-bold">Cadastrar novo crachá</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Aproxime o crachá do celular para ler o UID, confira a pré-visualização
          e dê um nome antes de salvar.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Coluna 1 — leitor */}
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 flex flex-col items-center justify-center text-center min-h-[200px]">
            {previewUid ? (
              <>
                <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center mb-2">
                  <Check className="w-7 h-7 text-accent" />
                </div>
                <p className="font-bold">UID lido</p>
                <p className="font-mono text-xs text-muted-foreground mt-1">
                  {prettyUid(previewUid)}
                </p>
                <button
                  onClick={startScan}
                  disabled={!supported || scanning}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:underline disabled:text-muted-foreground"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Ler outro crachá
                </button>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mb-2">
                  <Wifi className="w-7 h-7 text-primary" />
                </div>
                <p className="font-bold">Pronto para ler</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Toque no botão e encoste o crachá na traseira do celular.
                </p>
                <button
                  onClick={startScan}
                  disabled={!supported || scanning}
                  className="mt-3 inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CreditCard className="w-4 h-4" />
                  {supported ? "Aproximar crachá" : "NFC indisponível"}
                </button>
              </>
            )}
          </div>

          {/* Coluna 2 — pré-visualização e salvar */}
          <div className="rounded-lg border border-border bg-background/50 p-4 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
              Pré-visualização
            </p>

            <div>
              <label className="text-xs font-medium mb-1 block">Nome do crachá</label>
              <input
                type="text"
                value={previewLabel}
                onChange={(e) => setPreviewLabel(e.target.value)}
                maxLength={60}
                placeholder="Ex: Crachá da carteira"
                className={`w-full px-3 py-2 bg-background border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                  labelError ? "border-destructive" : "border-border"
                }`}
              />
              {labelError && <p className="text-[11px] text-destructive mt-1">{labelError}</p>}
            </div>

            <div>
              <label className="text-xs font-medium mb-1 block">UID</label>
              <input
                type="text"
                value={previewUid}
                onChange={(e) => setPreviewUid(normalizeUid(e.target.value))}
                placeholder="Ainda não lido"
                className={`w-full px-3 py-2 bg-background border rounded text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring ${
                  uidError ? "border-destructive" : "border-border"
                }`}
              />
              {uidError && <p className="text-[11px] text-destructive mt-1">{uidError}</p>}
              {previewUid && !uidError && (
                <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                  {prettyUid(previewUid)} ({normalizeUid(previewUid).length / 2} bytes)
                </p>
              )}
            </div>

            {duplicate && (
              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  Este UID já está cadastrado como{" "}
                  <span className="font-semibold">"{duplicate.label || "sem nome"}"</span>.
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={resetPreview}
                disabled={savingPreview || (!previewUid && previewLabel === "Crachá")}
                className="flex-1 px-3 py-2 rounded text-sm border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                Limpar
              </button>
              <button
                onClick={savePreview}
                disabled={
                  savingPreview ||
                  !previewUid ||
                  !!uidError ||
                  !!labelError ||
                  !!duplicate
                }
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPreview ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Crachás cadastrados</h3>
          <span className="text-xs text-muted-foreground">{tags.length} total</span>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : tags.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum crachá cadastrado ainda.
          </p>
        ) : (
          <ul className="space-y-2">
            {tags.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 p-3 bg-background border border-border rounded"
              >
                <div className="min-w-0 flex-1">
                  {editingId === t.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        maxLength={60}
                        className="flex-1 px-2 py-1 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      <button
                        onClick={() => saveEditLabel(t)}
                        className="p-1.5 rounded hover:bg-accent/20 text-accent"
                        title="Salvar"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium truncate">
                        {t.label || "Crachá sem nome"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate font-mono">
                        UID {prettyUid(t.tag_uid)}
                      </p>
                      {t.last_used_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Último uso: {new Date(t.last_used_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {editingId !== t.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEditLabel(t)}
                      className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Renomear"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => remove(t)}
                      className="p-2 rounded hover:bg-destructive/10 text-destructive transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal "maquininha" durante a leitura */}
      <Dialog open={scanning} onOpenChange={(o) => { if (!o) cancelScan(); }}>
        <DialogContent
          className="max-w-sm border-primary/40 bg-gradient-to-b from-card to-background"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <VisuallyHidden>
            <DialogTitle>Leitura de crachá NFC</DialogTitle>
            <DialogDescription>
              Aproxime o crachá NFC da parte de trás do celular.
            </DialogDescription>
          </VisuallyHidden>
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
            <button
              onClick={cancelScan}
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminNfcTagsPage;
