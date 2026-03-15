import { useState } from "react";
import {
  Upload, Film, Clock, CheckCircle, XCircle, Play,
  FileVideo, Image, Type, Tag, Trash2, Eye
} from "lucide-react";

interface Video {
  id: number;
  title: string;
  thumbnail: string;
  duration: string;
  size: string;
  status: "processing" | "published" | "draft" | "failed";
  uploadDate: string;
  views: string;
  genre: string;
}

const mockVideos: Video[] = [
  { id: 1, title: "O Último Horizonte - Trailer Oficial", thumbnail: "🎬", duration: "2:34", size: "845 MB", status: "published", uploadDate: "12 Mar 2026", views: "1.2M", genre: "Ficção Científica" },
  { id: 2, title: "Sombras do Passado - Episódio 1", thumbnail: "🎬", duration: "48:12", size: "3.2 GB", status: "published", uploadDate: "10 Mar 2026", views: "980K", genre: "Suspense" },
  { id: 3, title: "Além das Estrelas - 4K Remasterizado", thumbnail: "🎬", duration: "1:52:30", size: "12.8 GB", status: "processing", uploadDate: "14 Mar 2026", views: "—", genre: "Aventura" },
  { id: 4, title: "A Fúria do Dragão - Temporada 2 EP3", thumbnail: "🎬", duration: "55:20", size: "4.1 GB", status: "draft", uploadDate: "15 Mar 2026", views: "—", genre: "Ação" },
  { id: 5, title: "Código Secreto - Versão do Diretor", thumbnail: "🎬", duration: "2:15:45", size: "18.5 GB", status: "failed", uploadDate: "13 Mar 2026", views: "—", genre: "Thriller" },
  { id: 6, title: "Revolução Digital - Documentário", thumbnail: "🎬", duration: "1:30:00", size: "6.7 GB", status: "published", uploadDate: "08 Mar 2026", views: "450K", genre: "Documentário" },
];

const statusConfig = {
  processing: { label: "Processando", icon: Clock, className: "bg-yellow-500/20 text-yellow-400" },
  published: { label: "Publicado", icon: CheckCircle, className: "bg-accent/20 text-accent" },
  draft: { label: "Rascunho", icon: FileVideo, className: "bg-muted text-muted-foreground" },
  failed: { label: "Erro", icon: XCircle, className: "bg-destructive/20 text-destructive" },
};

const AdminVideos = () => {
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Envio de Vídeos</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie e envie filmes, séries e trailers</p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Upload className="w-4 h-4" /> Novo Upload
        </button>
      </div>

      {showUpload && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); }}
          >
            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium mb-1">Arraste o vídeo aqui ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground">MP4, MKV, AVI, MOV • Máx. 50GB por arquivo</p>
            <button className="mt-4 px-6 py-2 bg-muted text-foreground rounded text-sm font-medium hover:bg-muted/80 transition-colors">
              Selecionar Arquivo
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Type className="w-3.5 h-3.5" /> Título</label>
              <input className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring" placeholder="Nome do filme ou série" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Gênero</label>
              <select className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                <option>Ação</option>
                <option>Aventura</option>
                <option>Comédia</option>
                <option>Drama</option>
                <option>Documentário</option>
                <option>Ficção Científica</option>
                <option>Suspense</option>
                <option>Terror</option>
                <option>Thriller</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Film className="w-3.5 h-3.5" /> Tipo</label>
              <select className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                <option>Filme</option>
                <option>Série - Episódio</option>
                <option>Trailer</option>
                <option>Documentário</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Image className="w-3.5 h-3.5" /> Thumbnail</label>
              <button className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-muted-foreground hover:border-muted-foreground/50 transition-colors text-left">
                Selecionar imagem de capa...
              </button>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium mb-1.5 block">Descrição</label>
            <textarea className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" rows={3} placeholder="Sinopse do conteúdo..." />
          </div>

          <div className="flex gap-3 mt-4">
            <button className="px-6 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold hover:bg-primary/90 transition-colors">
              Enviar e Publicar
            </button>
            <button className="px-6 py-2 bg-muted text-foreground rounded text-sm font-medium hover:bg-muted/80 transition-colors">
              Salvar Rascunho
            </button>
          </div>
        </div>
      )}

      {/* Video Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-black">248</p>
          <p className="text-xs text-muted-foreground">Total de Vídeos</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-black text-accent">232</p>
          <p className="text-xs text-muted-foreground">Publicados</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-black text-yellow-400">8</p>
          <p className="text-xs text-muted-foreground">Processando</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <p className="text-2xl font-black">4.2 TB</p>
          <p className="text-xs text-muted-foreground">Armazenamento</p>
        </div>
      </div>

      {/* Video List */}
      <div className="bg-card border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left p-3 font-medium">Vídeo</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Gênero</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Duração</th>
              <th className="text-left p-3 font-medium hidden md:table-cell">Tamanho</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium hidden sm:table-cell">Views</th>
              <th className="text-right p-3 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {mockVideos.map((video) => {
              const status = statusConfig[video.status];
              return (
                <tr key={video.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-lg shrink-0">
                        {video.thumbnail}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{video.title}</p>
                        <p className="text-xs text-muted-foreground">{video.uploadDate}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">{video.genre}</td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">{video.duration}</td>
                  <td className="p-3 text-muted-foreground hidden md:table-cell">{video.size}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${status.className}`}>
                      <status.icon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground hidden sm:table-cell">{video.views}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button className="p-1.5 hover:bg-muted rounded transition-colors" title="Preview">
                        <Play className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button className="p-1.5 hover:bg-muted rounded transition-colors" title="Visualizar">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button className="p-1.5 hover:bg-destructive/20 rounded transition-colors" title="Excluir">
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminVideos;
