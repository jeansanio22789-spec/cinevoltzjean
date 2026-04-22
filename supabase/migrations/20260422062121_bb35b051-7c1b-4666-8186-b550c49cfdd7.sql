-- Tabela de log de auditoria
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  description TEXT,
  changes JSONB,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);

-- RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem visualizar
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Qualquer usuário autenticado pode inserir o próprio log (registrando suas ações)
CREATE POLICY "Authenticated users can insert their own audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Ninguém pode editar/excluir logs (auditoria imutável)
-- (Sem políticas UPDATE/DELETE = bloqueado por padrão)