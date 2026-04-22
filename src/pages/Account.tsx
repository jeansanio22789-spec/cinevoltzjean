import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User as UserIcon, Crown, Calendar, CreditCard, Receipt,
  Download, Loader2, AlertCircle, CheckCircle2, ArrowRight, LogOut
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  plan: string | null;
  status: string | null;
  created_at: string;
}

interface Transaction {
  id: string;
  plan: string;
  amount: number;
  method: string | null;
  status: string | null;
  created_at: string;
}

const Account = () => {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }

    const load = async () => {
      const [profRes, txRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      setProfile((profRes.data as Profile) || null);
      setTransactions((txRes.data as Transaction[]) || []);
      setLoading(false);
    };
    load();
  }, [user, authLoading, navigate]);

  // Last approved transaction defines next renewal (30 days after)
  const lastApproved = useMemo(
    () => transactions.find((t) => t.status === "Aprovado"),
    [transactions]
  );

  const nextRenewal = useMemo(() => {
    if (!lastApproved) return null;
    const d = new Date(lastApproved.created_at);
    d.setDate(d.getDate() + 30);
    return d;
  }, [lastApproved]);

  const daysLeft = useMemo(() => {
    if (!nextRenewal) return null;
    const diff = Math.ceil((nextRenewal.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [nextRenewal]);

  const totalPaid = useMemo(
    () =>
      transactions
        .filter((t) => t.status === "Aprovado")
        .reduce((sum, t) => sum + Number(t.amount || 0), 0),
    [transactions]
  );

  const downloadReceipt = (tx: Transaction) => {
    const lines = [
      "==============================",
      "       STREAMFLIX RECIBO      ",
      "==============================",
      ``,
      `Recibo Nº: ${tx.id.slice(0, 8).toUpperCase()}`,
      `Data: ${new Date(tx.created_at).toLocaleString("pt-BR")}`,
      `Cliente: ${profile?.name || profile?.email || "—"}`,
      `Email: ${profile?.email || "—"}`,
      ``,
      `Plano: ${tx.plan}`,
      `Valor: R$ ${Number(tx.amount).toFixed(2)}`,
      `Método: ${tx.method || "—"}`,
      `Status: ${tx.status || "—"}`,
      ``,
      "Obrigado pela assinatura!",
      "==============================",
    ].join("\n");

    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recibo-streamflix-${tx.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Recibo baixado");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const planName = profile?.plan || "Básico";
  const isActive = profile?.status === "Ativo" && lastApproved;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16 px-4 md:px-12 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
              <UserIcon className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black">Minha Conta</h1>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors self-start"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>

        {/* Current Plan card */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-card to-card p-6 md:p-8 mb-6">
          <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
          <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-2">
                <Crown className="w-4 h-4" /> Plano atual
              </div>
              <p className="text-3xl md:text-4xl font-black">{planName}</p>
              <span
                className={`inline-flex items-center gap-1 mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  isActive
                    ? "bg-accent/20 text-accent"
                    : "bg-yellow-500/20 text-yellow-400"
                }`}
              >
                {isActive ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {isActive ? "Ativo" : "Pagamento pendente"}
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                <Calendar className="w-4 h-4" /> Próximo vencimento
              </div>
              {nextRenewal ? (
                <>
                  <p className="text-2xl font-black">
                    {nextRenewal.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {daysLeft !== null && daysLeft >= 0
                      ? `Faltam ${daysLeft} dias para a renovação`
                      : `Vencido há ${Math.abs(daysLeft || 0)} dias`}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-medium text-muted-foreground">Sem assinatura ativa</p>
                  <p className="text-xs text-muted-foreground mt-1">Assine um plano para começar</p>
                </>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                <CreditCard className="w-4 h-4" /> Total investido
              </div>
              <p className="text-2xl font-black">R$ {totalPaid.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Em {transactions.filter((t) => t.status === "Aprovado").length} pagamento(s)
              </p>
            </div>
          </div>

          <div className="relative flex flex-wrap gap-3 mt-6">
            <Link
              to="/planos"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              {nextRenewal ? "Trocar de plano" : "Assinar agora"} <ArrowRight className="w-4 h-4" />
            </Link>
            {nextRenewal && (
              <Link
                to="/planos"
                className="inline-flex items-center gap-2 border border-border px-5 py-2.5 rounded font-medium text-sm hover:bg-muted transition-colors"
              >
                Renovar antecipado
              </Link>
            )}
          </div>
        </section>

        {/* Receipts */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 p-5 border-b border-border">
            <Receipt className="w-5 h-5 text-primary" />
            <h2 className="font-bold">Histórico de recibos</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {transactions.length} {transactions.length === 1 ? "registro" : "registros"}
            </span>
          </div>

          {transactions.length === 0 ? (
            <div className="p-12 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Nenhum recibo ainda</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Seus pagamentos aparecerão aqui após a confirmação
              </p>
              <Link
                to="/planos"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Ver planos <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="text-left p-4 font-medium">Data</th>
                    <th className="text-left p-4 font-medium">Plano</th>
                    <th className="text-left p-4 font-medium hidden sm:table-cell">Método</th>
                    <th className="text-left p-4 font-medium">Valor</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-right p-4 font-medium">Recibo</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-4 text-muted-foreground whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="p-4 font-medium">{tx.plan}</td>
                      <td className="p-4 text-muted-foreground hidden sm:table-cell">{tx.method || "—"}</td>
                      <td className="p-4 font-bold">R$ {Number(tx.amount).toFixed(2)}</td>
                      <td className="p-4">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            tx.status === "Aprovado"
                              ? "bg-accent/20 text-accent"
                              : tx.status === "Pendente"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-destructive/20 text-destructive"
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => downloadReceipt(tx)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" /> Baixar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Account;
