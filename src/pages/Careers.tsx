import { MapPin, Clock, Briefcase, ChevronRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const jobs = [
  {
    title: "Desenvolvedor(a) Full Stack Senior",
    department: "Engenharia",
    location: "Remoto - Brasil",
    type: "Tempo Integral",
    description: "Buscamos um(a) desenvolvedor(a) para construir e escalar nossa plataforma de streaming para milhões de usuários.",
  },
  {
    title: "Product Designer",
    department: "Design",
    location: "São Paulo, SP",
    type: "Tempo Integral",
    description: "Crie experiências incríveis para nossos assinantes em todas as plataformas.",
  },
  {
    title: "Analista de Dados",
    department: "Data & Analytics",
    location: "Remoto - Brasil",
    type: "Tempo Integral",
    description: "Analise dados de comportamento e engajamento para otimizar recomendações de conteúdo.",
  },
  {
    title: "Produtor(a) de Conteúdo Original",
    department: "Conteúdo",
    location: "Rio de Janeiro, RJ",
    type: "Tempo Integral",
    description: "Lidere a produção de séries e filmes originais StreamFlix.",
  },
  {
    title: "Engenheiro(a) de Infraestrutura / DevOps",
    department: "Engenharia",
    location: "Remoto - Brasil",
    type: "Tempo Integral",
    description: "Garanta a escalabilidade e performance da nossa infraestrutura para milhões de streams simultâneos.",
  },
  {
    title: "Gerente de Marketing Digital",
    department: "Marketing",
    location: "São Paulo, SP",
    type: "Tempo Integral",
    description: "Desenvolva estratégias de aquisição e retenção de assinantes em todos os canais digitais.",
  },
];

const perks = [
  "🏠 Trabalho remoto flexível",
  "🎬 Acesso Premium gratuito",
  "📚 Budget para educação",
  "🏥 Plano de saúde completo",
  "💰 Participação nos lucros",
  "🌴 30 dias de férias",
];

const Careers = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16 px-4 md:px-12">
        {/* Hero */}
        <div className="max-w-4xl mx-auto text-center mb-14">
          <h1 className="text-3xl md:text-5xl font-black mb-4">
            Trabalhe <span className="text-primary">Conosco</span>
          </h1>
          <p className="text-muted-foreground text-sm md:text-base max-w-lg mx-auto">
            Faça parte do time que está revolucionando o entretenimento no Brasil. Junte-se a nós e ajude a levar histórias incríveis para milhões de pessoas.
          </p>
        </div>

        {/* Perks */}
        <div className="max-w-4xl mx-auto mb-14">
          <h2 className="text-xl font-bold text-center mb-6">Por que trabalhar na StreamFlix?</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {perks.map((perk) => (
              <div key={perk} className="bg-card border border-border rounded-lg p-4 text-sm font-medium text-center hover:border-muted-foreground/30 transition-colors">
                {perk}
              </div>
            ))}
          </div>
        </div>

        {/* Jobs */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Vagas Abertas <span className="text-muted-foreground font-normal text-sm">({jobs.length})</span></h2>
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.title}
                className="bg-card border border-border rounded-lg p-5 hover:border-primary/40 transition-all group cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-base group-hover:text-primary transition-colors">{job.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{job.description}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" />{job.department}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{job.location}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{job.type}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 hidden sm:block" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default Careers;
