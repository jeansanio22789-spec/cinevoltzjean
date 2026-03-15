import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

const Login = () => {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (isSignUp) {
      const { error } = await signUp(email, password);
      if (error) {
        setError(error.message);
      } else {
        setSuccess("Conta criada! Verifique seu email ou faça login.");
        setIsSignUp(false);
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        setError("Email ou senha inválidos.");
      } else {
        navigate("/admin");
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-primary font-black text-3xl tracking-tight mb-2">STREAMFLIX</p>
          <p className="text-muted-foreground text-sm">
            {isSignUp ? "Crie sua conta de administrador" : "Acesse o painel administrativo"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="admin@streamflix.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2 pr-10 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="••••••••"
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
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSignUp ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            {loading ? "Aguarde..." : isSignUp ? "Criar Conta" : "Entrar"}
          </button>

          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError(""); setSuccess(""); }}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {isSignUp ? "Já tem conta? Faça login" : "Não tem conta? Cadastre-se"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
