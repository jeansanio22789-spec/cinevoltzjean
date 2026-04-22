import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "publish"
  | "unpublish"
  | "login"
  | "logout"
  | "approve"
  | "reject"
  | "upload"
  | "settings_change";

export type AuditResource =
  | "movie"
  | "user"
  | "transaction"
  | "settings"
  | "video"
  | "auth"
  | "plan";

export interface LogParams {
  action: AuditAction;
  resource_type: AuditResource;
  resource_id?: string;
  description: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> } | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Registra uma ação no log de auditoria.
 * Falha silenciosamente — auditoria nunca deve quebrar o fluxo do usuário.
 */
export const logAudit = async (params: LogParams): Promise<void> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      action: params.action,
      resource_type: params.resource_type,
      resource_id: params.resource_id ?? null,
      description: params.description,
      changes: (params.changes as never) ?? null,
      metadata: (params.metadata as never) ?? null,
    });
  } catch (err) {
    console.warn("[audit] failed to log:", err);
  }
};
