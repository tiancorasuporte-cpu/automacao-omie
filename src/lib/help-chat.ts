export type HelpTopic = {
  id: string;
  label: string;
  keywords: string[];
  answer: string;
};

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "hospede",
    label: "Cadastrar hóspede",
    keywords: ["hóspede", "hospede", "cadastrar", "check-in", "checkin", "rosto", "face", "foto"],
    answer:
      "Em Hóspedes → Novo hóspede, preencha nome, CPF, quarto, datas da estadia e a foto do rosto. Com a estadia válida, a face é enviada aos Face Max liberados. Se o WhatsApp (Waha) estiver ativo e houver telefone, o hóspede pode receber aviso após o cadastro facial.",
  },
  {
    id: "funcionario",
    label: "Funcionários",
    keywords: ["funcionário", "funcionario", "staff", "colaborador", "equipe"],
    answer:
      "Em Funcionários você cadastra a equipe com departamento e foto. Diferente do hóspede, não usa quarto/estadia — o acesso costuma ficar liberado enquanto o cadastro estiver ativo.",
  },
  {
    id: "equipamento",
    label: "Equipamentos",
    keywords: ["equipamento", "device", "face max", "facemax", "sincronizar", "sync", "ip", "porta"],
    answer:
      "Em Equipamentos cadastre o Face Max (IP, porta, usuário e senha). Use Sincronizar para enviar pessoas àquele aparelho, Abrir porta para teste e Limpar faces se precisar zerar as faces no equipamento.",
  },
  {
    id: "monitoramento",
    label: "Monitoramento",
    keywords: ["monitoramento", "evento", "acesso", "botoeira", "acionar", "abrir porta", "presença"],
    answer:
      "Em Monitoramento veja presença e eventos (face, botoeira, remoto). Em Acionar equipamentos você abre a porta de um Face Max da unidade. Os eventos são coletados de todos os equipamentos cadastrados do hotel.",
  },
  {
    id: "cameras",
    label: "Câmeras",
    keywords: ["câmera", "camera", "cameras", "mosaico", "zeus", "visão", "visao"],
    answer:
      "O módulo Câmeras aparece quando o superadmin libera nas configurações do hotel. Cadastre links do Zeus Vision e use o mosaico para ver várias câmeras juntos.",
  },
  {
    id: "waha",
    label: "WhatsApp (Waha)",
    keywords: ["whatsapp", "waha", "mensagem", "telefone", "sms"],
    answer:
      "O Waha é opcional por hotel. Em Configurações (com o módulo ativo) informe a URL/sessão do Waha. No cadastro do hóspede use telefone com DDD; após o enroll facial, a suíte pode enviar a mensagem de confirmação.",
  },
  {
    id: "usuarios",
    label: "Usuários e papéis",
    keywords: ["usuário", "usuario", "senha", "admin", "porteiro", "perfil", "permissão", "permissao"],
    answer:
      "Admin gerencia unidade, equipamentos e usuários. Porteiro opera o dia a dia (hóspedes, monitoramento, acionamentos). Em Usuários o admin cria logins da unidade; em Meu perfil cada um altera a própria senha.",
  },
  {
    id: "unidade",
    label: "Código da unidade",
    keywords: ["unidade", "hotel", "slug", "código", "codigo", "login"],
    answer:
      "No login use o código (slug) da unidade + usuário e senha. O superadmin cria unidades em Hotéis e pode enviar o link com ?hotel=codigo. Cada hotel tem seus próprios equipamentos, pessoas e eventos.",
  },
  {
    id: "sincronizar",
    label: "Face não liberou",
    keywords: ["não liberou", "nao liberou", "não abre", "nao abre", "negado", "sync falhou", "erro sync"],
    answer:
      "Confira: 1) estadia ainda válida (hóspede), 2) foto nítida de frente, 3) equipamento online e sincronizado, 4) pessoa liberada naquele Face Max. Em Equipamentos rode Sincronizar e veja a última sincronização / erro.",
  },
];

const CONTEXT_TIPS: Array<{ match: (path: string) => boolean; tip: string }> = [
  {
    match: (path) => path.startsWith("/people"),
    tip: "Você está em Hóspedes. Posso explicar cadastro, foto facial, estadia ou WhatsApp.",
  },
  {
    match: (path) => path.startsWith("/staff"),
    tip: "Você está em Funcionários. Posso ajudar com cadastro da equipe e liberação nos Face Max.",
  },
  {
    match: (path) => path.startsWith("/devices"),
    tip: "Você está em Equipamentos. Posso orientar cadastro, sync, abrir porta ou limpar faces.",
  },
  {
    match: (path) => path.startsWith("/monitoring"),
    tip: "Você está no Monitoramento. Posso explicar eventos, presença e acionamento remoto.",
  },
  {
    match: (path) => path.startsWith("/cameras"),
    tip: "Você está em Câmeras. Posso falar de links Zeus Vision e mosaico.",
  },
  {
    match: (path) => path.startsWith("/users") || path.startsWith("/profile"),
    tip: "Aqui você gerencia acessos à suíte. Posso explicar papéis admin e porteiro.",
  },
  {
    match: (path) => path.startsWith("/settings"),
    tip: "Em Configurações ficam preferências da unidade e, se ativo, o Waha.",
  },
  {
    match: (path) => path.startsWith("/hotels"),
    tip: "Painel de hotéis: criar unidade, ativar módulos Câmeras/Waha e entrar em cada hotel.",
  },
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

export function contextTipForPath(pathname: string) {
  return (
    CONTEXT_TIPS.find((item) => item.match(pathname))?.tip ??
    "Olá! Sou o assistente Âncora Access. Escolha um assunto abaixo ou digite sua dúvida."
  );
}

export function answerHelpQuestion(question: string): { topic: HelpTopic | null; answer: string } {
  const q = normalize(question);
  if (!q) {
    return {
      topic: null,
      answer: "Me diga o que precisa — por exemplo: cadastrar hóspede, sincronizar Face Max ou abrir porta.",
    };
  }

  let best: HelpTopic | null = null;
  let bestScore = 0;
  for (const topic of HELP_TOPICS) {
    let score = 0;
    for (const keyword of topic.keywords) {
      const key = normalize(keyword);
      if (q.includes(key)) score += key.length >= 6 ? 3 : 2;
    }
    if (normalize(topic.label).split(/\s+/).some((word) => word.length > 3 && q.includes(word))) {
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }

  if (!best || bestScore < 2) {
    return {
      topic: null,
      answer:
        "Não encontrei esse tema com precisão. Tente um dos atalhos (hóspede, equipamentos, monitoramento…) ou reformule com palavras como “cadastrar”, “sincronizar” ou “abrir porta”.",
    };
  }

  return { topic: best, answer: best.answer };
}
