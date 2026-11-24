/** Central de ajuda da Nexo (dados de exemplo, Anexo B). */

export interface Article {
  id: string;
  title: string;
  body: string;
  /** Termos extras que as pessoas usam para descrever o problema. */
  keywords: string[];
}

export const ARTICLES: Article[] = [
  {
    id: "KB-01",
    title: "VPN com erro 809",
    body:
      "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. " +
      "Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    keywords: ["vpn", "809", "conectar", "conexao", "remoto", "home office", "globalprotect"],
  },
  {
    id: "KB-02",
    title: "Horário do service desk",
    body:
      "De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas. " +
      "Por telefone, ligue no ramal 4000.",
    keywords: ["horario", "atendimento", "plantao", "funciona", "telefone", "ramal", "fim de semana"],
  },
  {
    id: "KB-03",
    title: "Como redefinir a senha da rede",
    body:
      "Acesse senha.nexo.com.br, confirme com o aplicativo de autenticação (MFA) e defina a nova senha. " +
      "Depois de 3 tentativas erradas a conta fica bloqueada por 15 minutos e é liberada sozinha. " +
      "A senha expira a cada 90 dias.",
    keywords: ["senha", "rede", "windows", "login", "esqueci", "expirou", "bloqueada", "trocar", "redefinir"],
  },
  {
    id: "KB-04",
    title: "Senha do SAP bloqueada",
    body:
      "Use o autoatendimento em sap-self.nexo.com.br com o MFA para desbloquear na hora. " +
      "Se você não tem MFA configurado ou o desbloqueio falhar, abra um chamado de Acesso.",
    keywords: ["sap", "senha", "bloqueada", "bloqueio", "desbloquear", "erp"],
  },
  {
    id: "KB-05",
    title: "Wi-Fi para visitantes e para funcionários",
    body:
      "Visitantes usam a rede Nexo-Guest; a senha fica na recepção e muda toda segunda-feira. " +
      "Funcionários usam a rede Nexo-Corp com o mesmo login e senha da rede.",
    keywords: ["wifi", "wi-fi", "internet", "rede", "visitante", "convidado", "sem fio"],
  },
  {
    id: "KB-06",
    title: "Outlook não sincroniza no celular",
    body:
      "Instale o Outlook e o Portal da Empresa (Intune) no celular. Se parou de sincronizar, " +
      "remova a conta no Outlook, adicione de novo e aprove o acesso no Portal da Empresa.",
    keywords: ["outlook", "email", "e-mail", "celular", "sincroniza", "iphone", "android", "intune"],
  },
  {
    id: "KB-07",
    title: "Instalar um software",
    body:
      "Softwares do catálogo são instalados sozinhos pelo portal de softwares (software.nexo.com.br). " +
      "Software fora do catálogo é uma requisição, que precisa da aprovação do seu gestor.",
    keywords: ["instalar", "software", "programa", "aplicativo", "licenca", "portal de softwares"],
  },
  {
    id: "KB-08",
    title: "Computador lento",
    body:
      "Reinicie o computador, rode o Diagnóstico Nexo pelo portal de softwares e confira se há pelo menos 15% de disco livre. " +
      "Se continuar lento depois disso, abra um chamado de Hardware.",
    keywords: ["lento", "lentidao", "travando", "notebook", "computador", "desempenho", "atualizacao"],
  },
  {
    id: "KB-09",
    title: "Acesso a pastas do SharePoint",
    body:
      "Peça acesso ao dono da pasta pelo botão Solicitar acesso. Se não souber quem é o dono, " +
      "abra uma requisição de Acesso; ela precisa da aprovação do seu gestor.",
    keywords: ["sharepoint", "pasta", "acesso", "permissao", "arquivo", "teams", "onedrive"],
  },
  {
    id: "KB-10",
    title: "Impressoras",
    body:
      "As impressoras usam a Impressão Nexo: mande para a fila e libere com o crachá em qualquer impressora. " +
      "Se a fila travar, use Reiniciar fila no portal de softwares.",
    keywords: ["impressora", "imprimir", "impressao", "fila", "cracha", "scanner"],
  },
];
