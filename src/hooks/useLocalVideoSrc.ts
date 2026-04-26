import { useEffect, useState } from "react";
import {
  getLocalVideoBlob,
  isLocalVideoUrl,
  parseLocalVideoId,
} from "@/lib/localVideoStore";

/**
 * Resolve uma URL `local://<id>` para um `blob:` URL tocável pelo player.
 * Se a URL não for local, retorna ela mesma sem mudar.
 */
export const useLocalVideoSrc = (rawUrl: string | null | undefined) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(rawUrl ?? null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let revoke: string | null = null;
    let active = true;

    const run = async () => {
      if (!rawUrl) {
        setResolvedUrl(null);
        setMissing(false);
        return;
      }
      if (!isLocalVideoUrl(rawUrl)) {
        setResolvedUrl(rawUrl);
        setMissing(false);
        return;
      }
      setLoading(true);
      const id = parseLocalVideoId(rawUrl);
      if (!id) {
        setMissing(true);
        setLoading(false);
        return;
      }
      const blob = await getLocalVideoBlob(id);
      if (!active) return;
      if (!blob) {
        setMissing(true);
        setResolvedUrl(null);
      } else {
        const objUrl = URL.createObjectURL(blob);
        revoke = objUrl;
        setResolvedUrl(objUrl);
        setMissing(false);
      }
      setLoading(false);
    };

    void run();
    return () => {
      active = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [rawUrl]);

  return { resolvedUrl, missing, loading };
};
