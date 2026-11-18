// ============================================================
//  CONFIGURAÇÃO DO PLANNER — edite só este arquivo
// ============================================================
window.CONFIG = {
  // Usuário/organização dono do repositório e nome do repositório
  OWNER: 'SEU-USUARIO',
  REPO: 'planner-campo',

  // Branch onde os registros são salvos (criado automaticamente).
  // Fica separado do site para não poluir o main nem refazer o deploy a cada registro.
  BRANCH_DADOS: 'dados',
  PASTA: 'registros',          // registros/2026-11.json, registros/2026-12.json ...

  // Opcional: token direto aqui. ATENÇÃO: em repositório público o GitHub
  // detecta e REVOGA o token automaticamente. Prefira o link de convite (#token=...).
  TOKEN: '',

  TITULO: 'Quarta em Campo',
  INTERVALO_ATUALIZACAO: 20,   // segundos entre atualizações do painel

  // Tipos de atividade (botões rápidos). km:true mostra o campo de distância.
  TIPOS: [
    { nome: 'Deslocamento',   icone: '🚗', km: true },
    { nome: 'Acompanhamento', icone: '👷' },
    { nome: 'Visita',         icone: '📍' },
    { nome: 'Reunião',        icone: '💬' },
    { nome: 'Almoço',         icone: '🍽️' },
    { nome: 'Jantar',         icone: '🌙' },
  ],
};
