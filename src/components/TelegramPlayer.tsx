import { ArrowLeft, Upload } from "lucide-react";

interface TelegramPlayerProps {
  movie: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    telegram_url: string | null;
    video_url?: string | null;
    year: number | null;
    duration: string | null;
    genre: string | null;
    rating: string | null;
  };
  onBack: () => void;
}

/**
 * Quando o filme tem só um link `t.me/...` (não um arquivo hospedado), o vídeo
 * NÃO pode tocar inline — Telegram bloqueia embed e canais privados exigem auth.
 * Mostramos uma mensagem orientando o admin a subir o arquivo de vídeo.
 */
const TelegramPlayer = ({ movie, onBack }: TelegramPlayerProps) => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
        >
          <ArrowLeft className="h-5 w-5" /> Voltar
        </button>
        <h1 className="max-w-[58%] truncate text-sm font-bold md:text-base">{movie.title}</h1>
        <div className="w-10" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        {movie.thumbnail_url && (
          <img
            src={movie.thumbnail_url}
            alt={movie.title}
            className="h-60 w-44 rounded-lg object-cover shadow-2xl"
          />
        )}
        <div className="space-y-2 max-w-md">
          <p className="text-2xl font-black">Vídeo ainda não disponível</p>
          <p className="text-sm text-muted-foreground">
            Este filme tem apenas um link de referência. O administrador precisa
            enviar o arquivo de vídeo para que ele toque diretamente aqui no app.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-xs text-muted-foreground">
          <Upload className="h-3.5 w-3.5" />
          Aguarde o upload do arquivo
        </div>
      </div>
    </div>
  );
};

export default TelegramPlayer;
