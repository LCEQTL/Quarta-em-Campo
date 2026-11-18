# Quarta em Campo

Planner de atividades de campo. Cada pessoa planeja os destinos do dia, marca o início e a conclusão
de cada atividade pelo celular, e toda a equipe acompanha em tempo real (o painel atualiza a cada 20 s).
Os registros são salvos como commits **neste próprio repositório**, no branch `dados`.

## Instalação (≈10 min)

1. **Crie um repositório público** no GitHub (ex.: `planner-campo`) e envie todos estes arquivos para o branch `main`.
   *(O GitHub Pages gratuito exige repositório público.)*
2. Edite `config.js` e coloque seu usuário em `OWNER` e o nome do repositório em `REPO`.
3. Ative o site: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**.
   Em ~1 minuto o site fica em `https://SEU-USUARIO.github.io/planner-campo/`.
4. Crie o token: **foto do perfil → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - *Repository access*: **Only select repositories** → escolha só este repositório
   - *Permissions → Repository permissions → Contents*: **Read and write**
   - *Expiration*: o máximo permitido (anote a data para renovar)
5. Abra o site **uma vez** com o token no final do endereço:
   `https://SEU-USUARIO.github.io/planner-campo/#token=github_pat_XXXX`
   Depois, toque no seu nome (canto superior direito) → **Copiar link de convite** e mande no grupo da equipe.
   Quem abrir o link já fica com a chave salva no celular; o token some da barra de endereço.

> Por que não colocar o token direto no `config.js`? Em repositório público o GitHub detecta o token
> e o **revoga automaticamente** em minutos. Pelo link ele nunca fica gravado no código.

**Logo (opcional):** coloque um arquivo `logo.png` (fundo transparente, branco) na raiz; ele aparece no cabeçalho.

**No celular:** no Chrome, menu ⋮ → *Adicionar à tela inicial*. Abre como app e funciona mesmo sem sinal.

## Como funciona

| Aba | Para quê |
|---|---|
| **Meu dia** | Escolhe o tipo (Deslocamento, Visita…) e o destino → **Iniciar**. O sistema pega a hora. **Concluir** marca o fim. Iniciar outra atividade conclui a anterior automaticamente. |
| **Planejar** | Lista dos lugares/equipes do dia (hoje ou amanhã). Aparecem como botões rápidos no Meu dia e com ✓ quando visitados. |
| **Equipe** | Todo mundo, em tempo real: o que cada um está fazendo, planejado × realizado, totais de tempo e km. Exporta o mês em CSV (abre no Excel). |

- **Distância** (só deslocamento) e **OBS** são opcionais em tudo.
- **Edição de horários**: toque numa linha sua para editar. Todo horário alterado ganha a marca **″**;
  tocando nela qualquer pessoa vê o horário original e quem/quando mudou. Registros lançados à mão ficam marcados como *manual*.
- **Sem sinal**: os registros ficam na fila (⏳) com a hora certa do clique e sobem sozinhos quando a conexão voltar.

## Onde ficam os dados

Branch `dados`, pasta `registros/`, **um arquivo por mês** (`2026-11.json`, `2026-12.json`…), com uma atividade por linha.
Cada ação vira um commit (`JOAO CARLOS SILVA: inicia Visita · SE Picos`), então o histórico do GitHub também serve de auditoria.

Para mudar os tipos de atividade, o intervalo de atualização ou o título, edite `config.js`.
