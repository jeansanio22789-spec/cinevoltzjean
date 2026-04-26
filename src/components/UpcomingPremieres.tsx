import { FileVideo, Sparkles } from "lucide-react";
import { useUploadQueue } from "@/hooks/useUploadQueue";

const fmtEndTimeFromTs = (endAtMs: number) =>
  new Date(endAtMs).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Mostra na home, estilo "estreia", os filmes que estão sendo enviados agora,
 * com a capa e o horário previsto de chegada.
 * Some sozinho quando não tem upload ativo.
 */
const UpcomingPremieres = () => {
  const { jobs } = useUploadQueue();

  const upcoming = jobs.filter(
    (j) =>
      j.status === "uploading" ||
      j.status === "saving" ||
      j.status === "warning" ||
      j.status === "queued",
  );

  if (upcoming.length === 0) return null;

  return (
    <section className="px-4 md:px-12 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <h2 className="text-lg md:text-xl font-bold">Estreia em breve</h2>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-2">
        {upcoming.map((j) => {
          const hasEta = j.etaSec > 0 && j.etaSec < 99999;
          const endLabel = hasEta ? fmtEndTime(j.etaSec) : null;
          const isWaiting = j.status === "queued" || j.status === "saving";
          return (
            <div
              key={j.id}
              className="relative flex-shrink-0 w-[140px] md:w-[170px] rounded-lg overflow-hidden border border-border bg-muted shadow-lg"
            >
              {j.thumbPreviewUrl ? (
                <img
                  src={j.thumbPreviewUrl}
                  alt={j.meta.title}
                  className="w-full aspect-[2/3] object-cover"
                />
              ) : (
                <div className="w-full aspect-[2/3] flex items-center justify-center bg-muted">
                  <FileVideo className="w-10 h-10 text-muted-foreground" />
                </div>
              )}

              {/* Badge "ESTREIA" no topo */}
              <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-black tracking-wider px-2 py-0.5 rounded uppercase shadow">
                Estreia
              </div>

              {/* Barra de progresso embutida */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                <div
                  className={`h-full transition-all ${
                    j.status === "warning" ? "bg-amber-500" : "bg-primary"
                  }`}
                  style={{ width: `${j.progress}%` }}
                />
              </div>

              {/* Overlay inferior com título + horário previsto */}
              <div className="absolute inset-x-0 bottom-1 p-2 pt-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
                <p className="text-white text-xs font-semibold truncate">
                  {j.meta.title}
                </p>
                {endLabel ? (
                  <p className="text-[11px] text-primary-foreground bg-primary/90 inline-block px-1.5 py-0.5 rounded mt-1 font-bold">
                    🕒 No app às {endLabel}
                  </p>
                ) : (
                  <p className="text-[11px] text-white/80 mt-1">
                    {isWaiting ? "Preparando…" : `${j.progress.toFixed(0)}% enviado`}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default UpcomingPremieres;
