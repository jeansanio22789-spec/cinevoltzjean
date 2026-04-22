import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Conta quantos espectadores estão assistindo um canal ao vivo em tempo real.
 * Usa Supabase Realtime Presence — não precisa de tabela, atualiza instantâneo.
 *
 * @param channelKey identificador único do canal (ex: id do canal). Se vazio, não conecta.
 * @param join se true, este espectador entra na contagem (use no player principal).
 *             Se false, só observa a contagem (use em thumbnails).
 */
export const useLiveViewers = (channelKey: string | null | undefined, join = true) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!channelKey) {
      setCount(0);
      return;
    }

    const room = supabase.channel(`live-viewers:${channelKey}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });

    const recompute = () => {
      const state = room.presenceState();
      // cada chave de presence é um espectador único
      setCount(Object.keys(state).length);
    };

    room
      .on("presence", { event: "sync" }, recompute)
      .on("presence", { event: "join" }, recompute)
      .on("presence", { event: "leave" }, recompute)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && join) {
          await room.track({ joined_at: Date.now() });
        }
      });

    return () => {
      try { room.untrack(); } catch { /* noop */ }
      supabase.removeChannel(room);
    };
  }, [channelKey, join]);

  return count;
};

/**
 * Conta espectadores em vários canais ao mesmo tempo (para listar nas thumbnails).
 * Retorna um Record<channelKey, count>.
 */
export const useLiveViewersMulti = (channelKeys: string[]) => {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!channelKeys.length) {
      setCounts({});
      return;
    }

    const observers = channelKeys.map((key) => {
      const room = supabase.channel(`live-viewers:${key}`);
      const recompute = () => {
        const state = room.presenceState();
        setCounts((prev) => ({ ...prev, [key]: Object.keys(state).length }));
      };
      room
        .on("presence", { event: "sync" }, recompute)
        .on("presence", { event: "join" }, recompute)
        .on("presence", { event: "leave" }, recompute)
        .subscribe();
      return room;
    });

    return () => {
      observers.forEach((r) => supabase.removeChannel(r));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKeys.join("|")]);

  return counts;
};
