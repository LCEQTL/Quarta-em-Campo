'use strict';
(() => {
// ============================================================
//  Quarta em Campo — dados salvos no próprio repositório GitHub
// ============================================================
const C = Object.assign({
  OWNER: '', REPO: '', BRANCH_DADOS: 'dados', PASTA: 'registros', TOKEN: '',
  TITULO: 'Quarta em Campo', INTERVALO_ATUALIZACAO: 20, TIPOS: [],
}, window.CONFIG || {});

const LS_NOME = 'pc_nome', LS_TOKEN = 'pc_token', LS_FILA = 'pc_fila', LS_CACHE = 'pc_cache';
const API = 'https://api.github.com';

// ---------- utilitários ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const isoDe = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoje = () => isoDe(new Date());
const somaDias = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoDe(new Date(y, m - 1, d + n)); };
const agoraHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const mesDe = iso => iso.slice(0, 7);
const minDe = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const duracao = (ini, fim) => { let d = minDe(fim) - minDe(ini); if (d < 0) d += 1440; return d; };
const fmtDur = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const diaSemana = iso => { const [y, m, d] = iso.split('-').map(Number); return DIAS[new Date(y, m - 1, d).getDay()]; };
const fmtData = iso => iso.split('-').reverse().join('/');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chave = s => String(s || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR');
const nomeNorm = s => chave(s);
const tipoInfo = nome => C.TIPOS.find(t => t.nome.toLowerCase() === String(nome || '').toLowerCase());
const icone = nome => tipoInfo(nome)?.icone || '📝';
const parseKm = v => { const n = Number(String(v || '').replace(',', '.').trim()); return String(v || '').trim() === '' || isNaN(n) ? null : n; };
const fmtKm = n => String(n).replace('.', ',');
const lerJSON = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };

const b64enc = str => {
  const bytes = new TextEncoder().encode(str); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64dec = b64 => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0)));

// ---------- estado ----------
const S = {
  nome: localStorage.getItem(LS_NOME) || '',
  token: '',
  fila: lerJSON(LS_FILA, []),        // operações ainda não gravadas no GitHub
  remoto: lerJSON(LS_CACHE, {}),     // mes -> { dados, sha, etag }
  aba: 'meu',
  tipo: null,
  dataEquipe: hoje(),
  dataPlano: new Date().getHours() >= 14 ? somaDias(hoje(), 1) : hoje(),
  status: { estado: '', msg: '' },
  ultima: null,
  fechados: new Set(),
  repoOk: false,
};
const vazio = () => ({ planos: {}, atividades: [] });
const salvarFila = () => localStorage.setItem(LS_FILA, JSON.stringify(S.fila));
const salvarCache = () => { try { localStorage.setItem(LS_CACHE, JSON.stringify(S.remoto)); } catch {} };

// ---------- operações (aplicadas localmente e depois no GitHub) ----------
function aplicarOp(d, o) {
  d.planos ||= {}; d.atividades ||= [];
  if (o.k === 'add') { if (!d.atividades.some(a => a.id === o.a.id)) d.atividades.push(clone(o.a)); }
  else if (o.k === 'upd') { const a = d.atividades.find(a => a.id === o.id); if (a) Object.assign(a, o.c); }
  else if (o.k === 'del') { d.atividades = d.atividades.filter(a => a.id !== o.id); }
  else if (o.k === 'plano') {
    d.planos[o.data] ||= {};
    if (o.alvos.length) d.planos[o.data][o.nome] = o.alvos.slice();
    else { delete d.planos[o.data][o.nome]; if (!Object.keys(d.planos[o.data]).length) delete d.planos[o.data]; }
  }
}
function dadosMes(mes) {
  const d = clone(S.remoto[mes]?.dados || vazio());
  S.fila.filter(o => o.mes === mes).forEach(o => aplicarOp(d, o));
  d.atividades.sort((a, b) => (a.data + a.inicio).localeCompare(b.data + b.inicio));
  return d;
}
const mesesConhecidos = () => [...new Set([...Object.keys(S.remoto), ...S.fila.map(o => o.mes), mesDe(hoje())])];
const todasAtividades = () => mesesConhecidos().flatMap(m => dadosMes(m).atividades);
const pendentes = () => new Set(S.fila.flatMap(o => [o.id, o.a?.id]).filter(Boolean));
function minhaAberta() {
  return todasAtividades().filter(a => a.nome === S.nome && !a.fim)
    .sort((a, b) => (b.data + b.inicio).localeCompare(a.data + a.inicio))[0];
}

function enfileirar(...ops) {
  ops.forEach(o => { o.qid = uid(); S.fila.push(o); });
  salvarFila(); render(); sincronizar();
}

// ---------- GitHub API ----------
async function gh(path, opts = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}),
    ...(opts.headers || {}),
  };
  return fetch(API + path, { ...opts, headers, cache: 'no-store' });
}
async function erroGH(r) {
  let msg = ''; try { msg = (await r.json()).message || ''; } catch {}
  if (r.status === 401) return Object.assign(new Error('Token inválido ou expirado'), { auth: true });
  if (r.status === 403 && /rate limit/i.test(msg)) return new Error('Limite do GitHub atingido, aguarde');
  if (r.status === 403 || r.status === 404) return new Error('Token sem permissão neste repositório');
  return new Error(`GitHub ${r.status}: ${msg}`);
}
const repo = `/repos/${C.OWNER}/${C.REPO}`;
const caminho = mes => `${repo}/contents/${C.PASTA}/${mes}.json`;

async function verificarRepo() {
  if (S.repoOk) return;
  const r = await gh(repo);
  if (r.status === 404) throw new Error(`Repositório ${C.OWNER}/${C.REPO} não encontrado (ou token sem acesso)`);
  if (!r.ok) throw await erroGH(r);
  const info = await r.json();
  const b = await gh(`${repo}/branches/${encodeURIComponent(C.BRANCH_DADOS)}`);
  if (b.status === 404) {
    const ref = await gh(`${repo}/git/ref/heads/${encodeURIComponent(info.default_branch)}`);
    if (!ref.ok) throw await erroGH(ref);
    const sha = (await ref.json()).object.sha;
    const cr = await gh(`${repo}/git/refs`, { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${C.BRANCH_DADOS}`, sha }) });
    if (!cr.ok && cr.status !== 422) throw await erroGH(cr);
  } else if (!b.ok) throw await erroGH(b);
  S.repoOk = true;
}

function normalizar(d) {
  d = d && typeof d === 'object' ? d : {};
  return { planos: d.planos || {}, atividades: Array.isArray(d.atividades) ? d.atividades : [] };
}
async function lerMes(mes, usarEtag = true) {
  const atual = S.remoto[mes];
  const headers = {};
  if (usarEtag && atual?.etag) headers['If-None-Match'] = atual.etag;
  const r = await gh(`${caminho(mes)}?ref=${encodeURIComponent(C.BRANCH_DADOS)}`, { headers });
  if (r.status === 304) return false;
  if (r.status === 404) {
    const mudou = !!(atual && (atual.sha || atual.dados.atividades.length));
    S.remoto[mes] = { dados: vazio(), sha: null, etag: null };
    return mudou || !atual;
  }
  if (!r.ok) throw await erroGH(r);
  const j = await r.json();
  let texto;
  if (j.encoding === 'base64' && j.content) texto = b64dec(j.content);
  else {
    const raw = await gh(`${caminho(mes)}?ref=${encodeURIComponent(C.BRANCH_DADOS)}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    texto = await raw.text();
  }
  const mudou = !atual || atual.sha !== j.sha;
  S.remoto[mes] = { dados: normalizar(JSON.parse(texto || '{}')), sha: j.sha, etag: r.headers.get('ETag') };
  return mudou;
}

// JSON legível: cada atividade em uma linha (histórico de commits fica limpo)
function serializar(d) {
  const planos = JSON.stringify(d.planos, null, 2).replace(/\n/g, '\n  ');
  const ativ = d.atividades.map(a => '    ' + JSON.stringify(a)).join(',\n');
  return `{\n  "planos": ${planos},\n  "atividades": [\n${ativ}\n  ]\n}\n`;
}
function msgCommit(ops) {
  const o = ops[ops.length - 1];
  const quem = o.a?.nome || o.nome || S.nome;
  let txt = `${ops.length} alteração(ões)`;
  if (ops.length === 1) {
    if (o.k === 'add') txt = `inicia ${o.a.tipo}${o.a.alvo ? ' · ' + o.a.alvo : ''}`;
    else if (o.k === 'upd') txt = o.c.fim ? `conclui atividade às ${o.c.fim}` : 'edita atividade';
    else if (o.k === 'del') txt = 'exclui atividade';
    else if (o.k === 'plano') txt = `planeja ${fmtData(o.data)}`;
  }
  return `${quem}: ${txt}`;
}

async function gravarMes(mes, ops) {
  await verificarRepo();
  for (let t = 0; t < 6; t++) {
    await lerMes(mes, false);
    const base = S.remoto[mes];
    const dados = clone(base.dados);
    ops.forEach(o => aplicarOp(dados, o));
    dados.atividades.sort((a, b) => (a.data + a.inicio + a.nome).localeCompare(b.data + b.inicio + b.nome));
    const body = { message: msgCommit(ops), content: b64enc(serializar(dados)), branch: C.BRANCH_DADOS };
    if (base.sha) body.sha = base.sha;
    const r = await gh(caminho(mes), { method: 'PUT', body: JSON.stringify(body) });
    if (r.ok) {
      const j = await r.json();
      S.remoto[mes] = { dados, sha: j.content.sha, etag: null };
      return;
    }
    if (r.status === 409 || r.status === 422) { await sleep(400 + Math.random() * 1500); continue; } // alguém salvou junto
    throw await erroGH(r);
  }
  throw new Error('Muitas gravações simultâneas, tentando de novo');
}

let sincronizando = false;
async function sincronizar() {
  if (sincronizando || !S.fila.length || !S.token) return;
  sincronizando = true; setStatus('sync');
  try {
    for (const mes of [...new Set(S.fila.map(o => o.mes))]) {
      const ops = S.fila.filter(o => o.mes === mes);
      await gravarMes(mes, ops);
      const feitos = new Set(ops.map(o => o.qid));
      S.fila = S.fila.filter(o => !feitos.has(o.qid)); salvarFila();
    }
    salvarCache(); S.ultima = agoraHM(); setStatus('ok');
  } catch (e) {
    setStatus('erro', e.message);
    if (e.auth) pedirToken(e.message);
  } finally {
    sincronizando = false; render();
    if (S.fila.length && S.status.estado === 'ok') sincronizar();
  }
}

let atualizando = false;
async function atualizar() {
  if (atualizando || !S.token) return;
  atualizando = true;
  try {
    await verificarRepo();
    const meses = new Set([mesDe(hoje()), mesDe(S.dataEquipe), mesDe(S.dataPlano)]);
    let mudou = false;
    for (const m of meses) mudou = (await lerMes(m)) || mudou;
    if (mudou) { salvarCache(); render(); }
    S.ultima = agoraHM();
    if (!sincronizando) setStatus('ok');
  } catch (e) {
    if (!sincronizando) setStatus('erro', navigator.onLine ? e.message : 'Sem conexão');
    if (e.auth) pedirToken(e.message);
  } finally { atualizando = false; }
  sincronizar();
}

// ---------- ações ----------
function iniciar() {
  const tipo = S.tipo === '__outro' ? $('#tipoOutro').value.trim() : S.tipo;
  if (!tipo) { toast('Escolha o tipo da atividade'); return; }
  const h = agoraHM(), d = hoje();
  const ops = [];
  const aberta = minhaAberta();
  if (aberta) ops.push({ k: 'upd', mes: mesDe(aberta.data), id: aberta.id, c: { fim: h } });
  const a = { id: uid(), nome: S.nome, data: d, tipo, alvo: $('#alvo').value.trim(), inicio: h, fim: null, km: parseKm($('#km').value), obs: $('#obs').value.trim() };
  ops.push({ k: 'add', mes: mesDe(d), a });
  ['#alvo', '#km', '#obs', '#tipoOutro'].forEach(s => $(s).value = '');
  S.tipo = null;
  enfileirar(...ops);
  toast(aberta ? `${aberta.tipo} concluído e ${tipo} iniciado às ${h}` : `${tipo} iniciado às ${h}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function concluir(id) {
  const a = todasAtividades().find(x => x.id === id); if (!a) return;
  if (tipoInfo(a.tipo)?.km && a.km == null) { modalConcluir(a); return; }
  const h = agoraHM();
  enfileirar({ k: 'upd', mes: mesDe(a.data), id, c: { fim: h } });
  toast(`${a.tipo} concluído às ${h}`);
}

function salvarPlano(alvos) {
  enfileirar({ k: 'plano', mes: mesDe(S.dataPlano), data: S.dataPlano, nome: S.nome, alvos });
}
function addAlvo(v) {
  v = String(v || '').trim(); if (!v) return;
  const atual = meuPlano(S.dataPlano);
  if (atual.some(x => chave(x) === chave(v))) { toast('Já está na lista'); return; }
  salvarPlano([...atual, v]);
  $('#novoAlvo').value = '';
}
const meuPlano = data => dadosMes(mesDe(data)).planos[data]?.[S.nome] || [];

function exportar() {
  const mes = mesDe(S.dataEquipe);
  const d = dadosMes(mes);
  const linhas = [['Nome', 'Data', 'Dia', 'Início', 'Fim', 'Tempo', 'Atividade', 'Destino', 'Distância (km)', 'OBS']];
  [...d.atividades].sort((a, b) => (a.data + a.nome + a.inicio).localeCompare(b.data + b.nome + b.inicio)).forEach(a => {
    linhas.push([a.nome, fmtData(a.data), diaSemana(a.data), a.inicio, a.fim || '', a.fim ? fmtDur(duracao(a.inicio, a.fim)) : '',
      a.tipo, a.alvo || '', a.km != null ? fmtKm(a.km) : '', a.obs || '']);
  });
  const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const el = Object.assign(document.createElement('a'), { href: url, download: `planner-${mes}.csv` });
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- renderização ----------
function setStatus(estado, msg = '') { S.status = { estado, msg }; renderStatus(); }
function renderStatus() {
  const n = S.fila.length, el = $('#status'), { estado, msg } = S.status;
  el.className = 'status ' + (estado === 'erro' ? 'erro' : estado === 'sync' || n ? 'sync' : 'ok');
  let t = S.ultima ? `Atualizado ${S.ultima}` : 'Conectando…';
  if (estado === 'sync') t = 'Salvando…';
  else if (estado === 'erro') t = n ? `${msg} · ${n} pendente(s)` : msg;
  else if (n) t = `${n} pendente(s)`;
  $('#statusTxt').textContent = t;
}

function tempoTxt(a) {
  if (a.fim) return fmtDur(duracao(a.inicio, a.fim));
  if (a.data === hoje()) return fmtDur(duracao(a.inicio, agoraHM()));
  return '—';
}
// ---------- log de edição ----------
const ROTULO = { data: 'Data', tipo: 'Atividade', alvo: 'Destino', inicio: 'Início', fim: 'Fim', km: 'Distância', obs: 'OBS' };
const agoraCompleto = () => `${hoje()} ${agoraHM()}`;
const editado = (a, campo) => (a.hist || []).some(h => h.campo === campo || (h.acao === 'manual' && (campo === 'inicio' || campo === 'fim')));
const marca = (a, campo) => editado(a, campo) ? `<button class="editado" data-log="${a.id}" title="Horário alterado — ver histórico">″</button>` : '';
function diffHist(antes, depois) {
  const em = agoraCompleto(), h = [];
  Object.keys(ROTULO).forEach(k => {
    const de = antes[k] ?? null, para = depois[k] ?? null;
    if (k in depois && String(de ?? '') !== String(para ?? '')) h.push({ em, por: S.nome, campo: k, de, para });
  });
  return h;
}
function modalLog(a) {
  const h = a.hist || [];
  const orig = {};
  h.forEach(x => { if (x.campo && !(x.campo in orig)) orig[x.campo] = x.de; });
  const val = (k, v) => v == null || v === '' ? '<i>vazio</i>' : esc(k === 'km' ? fmtKm(v) + ' km' : k === 'data' ? fmtData(v) : v);
  abrirModal(`
    <h2>Histórico do registro</h2>
    <p class="legenda">${esc(a.nome)} · ${fmtData(a.data)} · ${esc(a.tipo)}${a.alvo ? ' · ' + esc(a.alvo) : ''}</p>
    ${h.some(x => x.acao === 'manual') ? '<p class="aviso-box">Registro lançado manualmente (não foi pelo botão Iniciar/Concluir).</p>' : ''}
    ${['inicio', 'fim'].filter(k => k in orig).length ? `<table class="tab mini-tab"><thead><tr><th></th><th>Original</th><th>Atual</th></tr></thead><tbody>
      ${['inicio', 'fim'].filter(k => k in orig).map(k => `<tr><td><b>${ROTULO[k]}</b></td><td>${val(k, orig[k])}</td><td>${val(k, a[k])}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <h3>Alterações</h3>
    <ul class="log">${h.map(x => `<li><span class="log-em">${fmtData(x.em.slice(0, 10))} ${x.em.slice(11)}</span> — ${esc(x.por)}<br>
      ${x.acao === 'manual' ? 'criou o registro manualmente' : `${ROTULO[x.campo]}: ${val(x.campo, x.de)} → <b>${val(x.campo, x.para)}</b>`}</li>`).reverse().join('')}</ul>
    <button class="btn sec" data-fechar>Fechar</button>`);
}

function tabela(lista, { editavel = () => false, pend = new Set(), total = true } = {}) {
  if (!lista.length) return '';
  const linhas = lista.map(a => `
    <tr class="${a.fim ? '' : 'aberta'} ${editavel(a) ? 'clicavel' : ''}" ${editavel(a) ? `data-edit="${a.id}"` : ''}>
      <td class="c-hora" data-l="Horário">${a.inicio}${marca(a, 'inicio')} às ${a.fim ? a.fim + marca(a, 'fim') : '<span class="agora">agora</span>'}</td>
      <td class="c-tipo" data-l="Atividade">${icone(a.tipo)} ${esc(a.tipo)}${pend.has(a.id) ? ' <span class="pend" title="Aguardando envio">⏳</span>' : ''}</td>
      <td class="c-alvo" data-l="Destino">${esc(a.alvo) || '<span class="legenda">—</span>'}</td>
      <td class="c-num" data-l="Distância">${a.km != null ? fmtKm(a.km) + ' Km' : ''}</td>
      <td class="c-num c-tempo" data-l="Tempo">${tempoTxt(a)}</td>
      <td class="c-obs" data-l="OBS">${esc(a.obs)}</td>
    </tr>`).join('');
  const km = lista.reduce((s, a) => s + (a.km || 0), 0);
  const min = lista.filter(a => a.fim).reduce((s, a) => s + duracao(a.inicio, a.fim), 0);
  return `<table class="tab resp">
    <thead><tr><th>Horário</th><th>Atividade</th><th>Destino</th><th class="c-num">Distância</th><th class="c-num">Tempo</th><th>OBS</th></tr></thead>
    <tbody>${linhas}</tbody>
    ${total ? `<tfoot><tr><td colspan="3"><b>TOTAL</b> (${lista.length} registro${lista.length > 1 ? 's' : ''})</td>
      <td class="c-num"><b>${km ? fmtKm(Math.round(km * 10) / 10) + ' Km' : ''}</b></td><td class="c-num"><b>${fmtDur(min)}</b></td><td></td></tr></tfoot>` : ''}
  </table>`;
}

function renderMeu() {
  const pend = pendentes();
  const aberta = minhaAberta();
  $('#atual').innerHTML = aberta ? `
    <div class="card atual">
      <div class="atual-rot">EM ANDAMENTO ${aberta.data !== hoje() ? `<span class="aviso">desde ${fmtData(aberta.data)}!</span>` : ''}</div>
      <div class="atual-tit">${icone(aberta.tipo)} ${esc(aberta.tipo)}${aberta.alvo ? ' · ' + esc(aberta.alvo) : ''}</div>
      <div class="atual-hora">Início ${aberta.inicio} · <b>${tempoTxt(aberta)}</b></div>
      <div class="atual-acoes">
        <button class="btn concluir grande" data-concluir="${aberta.id}">■ Concluir</button>
        <button class="btn sec" data-edit="${aberta.id}">✎</button>
      </div>
    </div>` : `<div class="card vazio-atual">Nenhuma atividade em andamento.</div>`;

  $$('#tipos .chip').forEach(b => b.classList.toggle('sel', b.dataset.tipo === S.tipo));
  $('#tipoOutro').classList.toggle('hidden', S.tipo !== '__outro');
  $('#campoKm').classList.toggle('hidden', !(tipoInfo(S.tipo)?.km || S.tipo === '__outro'));
  $('#btnIniciar').textContent = aberta ? '▶ Concluir atual e iniciar' : '▶ Iniciar agora';

  const plano = meuPlano(hoje());
  const feitos = new Set(todasAtividades().filter(a => a.nome === S.nome && a.data === hoje()).map(a => chave(a.alvo)));
  $('#chipsAlvo').innerHTML = plano.length
    ? plano.map(p => `<button class="chip alvo ${feitos.has(chave(p)) ? 'ok' : ''}" data-alvo="${esc(p)}">${feitos.has(chave(p)) ? '✓ ' : ''}${esc(p)}</button>`).join('')
    : `<span class="legenda">Sem planejamento para hoje — digite abaixo ou use a aba Planejar.</span>`;

  const minhas = dadosMes(mesDe(hoje())).atividades.filter(a => a.nome === S.nome && a.data === hoje());
  $('#meuDiaData').textContent = `${diaSemana(hoje())}, ${fmtData(hoje())}`;
  $('#meuDia').innerHTML = minhas.length
    ? tabela(minhas, { editavel: () => true, pend }) + '<p class="legenda dica">Toque numa linha para editar. ″ = horário alterado (toque para ver o original).</p>'
    : `<p class="legenda vazio">Nada registrado hoje.</p>`;
}

function renderPlano() {
  $('#dataPlano').value = S.dataPlano;
  $$('[data-plano-dia]').forEach(b => b.classList.toggle('sel', somaDias(hoje(), +b.dataset.planoDia) === S.dataPlano));
  $('#planoLegenda').textContent = `${diaSemana(S.dataPlano)}, ${fmtData(S.dataPlano)}`;
  const lista = meuPlano(S.dataPlano);
  $('#listaPlano').innerHTML = lista.length
    ? lista.map((p, i) => `<li><span>📍 ${esc(p)}</span><button class="btn link perigo" data-rm="${i}" aria-label="Remover">✕</button></li>`).join('')
    : `<li class="legenda">Nenhum destino ainda.</li>`;
  const ja = new Set(lista.map(chave));
  const sug = [];
  todasAtividades().filter(a => a.nome === S.nome).reverse().forEach(a => { if (a.alvo && !ja.has(chave(a.alvo)) && !sug.some(s => chave(s) === chave(a.alvo))) sug.push(a.alvo); });
  mesesConhecidos().forEach(m => Object.values(dadosMes(m).planos).forEach(pp => (pp[S.nome] || []).forEach(x => { if (!ja.has(chave(x)) && !sug.some(s => chave(s) === chave(x))) sug.push(x); })));
  $('#sugestoes').innerHTML = sug.length
    ? `<p class="legenda">Usados recentemente:</p><div class="chips">${sug.slice(0, 15).map(s => `<button class="chip" data-sug="${esc(s)}">+ ${esc(s)}</button>`).join('')}</div>` : '';
}

function renderEquipe() {
  const data = S.dataEquipe, ehHoje = data === hoje();
  $('#dataEquipe').value = data;
  const d = dadosMes(mesDe(data)), pend = pendentes();
  const ativ = d.atividades.filter(a => a.data === data);
  const planos = d.planos[data] || {};
  const nomes = [...new Set([...ativ.map(a => a.nome), ...Object.keys(planos)])];
  const pessoas = nomes.map(n => {
    const l = ativ.filter(a => a.nome === n);
    return { nome: n, ativ: l, plano: planos[n] || [], aberta: l.find(a => !a.fim) };
  }).sort((a, b) => (!!b.aberta - !!a.aberta) || a.nome.localeCompare(b.nome));

  const emCampo = pessoas.filter(p => p.aberta).length;
  $('#eqResumo').textContent = `${diaSemana(data)} · ${pessoas.length} pessoa(s)${ehHoje ? ` · ${emCampo} em atividade` : ''}`;

  const outros = [...new Set(d.atividades.map(a => a.nome))].filter(n => !nomes.includes(n)).sort();
  $('#listaEquipe').innerHTML = (pessoas.length ? pessoas.map(p => {
    const feitos = new Set(p.ativ.map(a => chave(a.alvo)));
    let st;
    if (p.aberta) st = `<span class="badge on">● ${esc(p.aberta.tipo)}${p.aberta.alvo ? ' · ' + esc(p.aberta.alvo) : ''}</span> <span class="legenda">desde ${p.aberta.inicio} (${tempoTxt(p.aberta)})</span>`;
    else if (p.ativ.length) st = `<span class="badge off">Encerrado às ${p.ativ[p.ativ.length - 1].fim}</span>`;
    else st = `<span class="badge plan">Somente planejado</span>`;
    return `<details class="card pessoa" data-nome="${esc(p.nome)}" ${S.fechados.has(p.nome) ? '' : 'open'}>
      <summary><span class="p-nome">${esc(p.nome)}</span><span class="p-status">${st}</span></summary>
      ${p.plano.length ? `<div class="p-plano"><span class="rot">Planejado:</span> ${p.plano.map(x => `<span class="chip mini ${feitos.has(chave(x)) ? 'ok' : ''}">${feitos.has(chave(x)) ? '✓' : '○'} ${esc(x)}</span>`).join('')}</div>` : ''}
      ${tabela(p.ativ, { editavel: a => a.nome === S.nome, pend })}
    </details>`;
  }).join('') : `<div class="card legenda">Ninguém registrou nada em ${fmtData(data)}.</div>`)
    + (outros.length ? `<p class="legenda sem-reg">Sem registro neste dia: ${outros.map(esc).join(', ')}</p>` : '');
}

function renderListas() {
  const alvos = new Set(), nomes = new Set();
  mesesConhecidos().forEach(m => {
    const d = dadosMes(m);
    d.atividades.forEach(a => { if (a.alvo) alvos.add(a.alvo); nomes.add(a.nome); });
    Object.values(d.planos).forEach(pp => Object.entries(pp).forEach(([n, l]) => { nomes.add(n); l.forEach(x => alvos.add(x)); }));
  });
  $('#listaAlvos').innerHTML = [...alvos].sort().map(a => `<option value="${esc(a)}">`).join('');
  $('#listaNomes').innerHTML = [...nomes].sort().map(a => `<option value="${esc(a)}">`).join('');
}

function render() {
  renderStatus();
  $('#btnUsuario').textContent = S.nome ? `👤 ${S.nome}` : '';
  $$('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === S.aba));
  $$('.aba').forEach(s => s.classList.toggle('hidden', s.id !== 'aba-' + S.aba));
  if (S.aba === 'meu') renderMeu();
  if (S.aba === 'plano') renderPlano();
  if (S.aba === 'equipe') renderEquipe();
  renderListas();
}

// ---------- modais ----------
function abrirModal(html, fixo = false) {
  $('#modalCorpo').innerHTML = html;
  $('#modal').classList.remove('hidden');
  $('#modal').dataset.fixo = fixo ? '1' : '';
  setTimeout(() => $('#modalCorpo input:not([type=hidden])')?.focus(), 50);
}
const fecharModal = () => $('#modal').classList.add('hidden');

function pedirNome() {
  abrirModal(`
    <h2>Bem-vindo(a)!</h2>
    <p>Digite seu <b>NOME COMPLETO</b>. Ele identifica seus registros para toda a equipe.</p>
    <input id="mNome" list="listaNomes" autocomplete="off" style="text-transform:uppercase" placeholder="EX.: MARIA DA SILVA SANTOS">
    <button class="btn primario grande" id="mNomeOk">Entrar</button>`, true);
  const ok = () => {
    const n = nomeNorm($('#mNome').value);
    if (n.split(' ').length < 2) { toast('Coloque o nome completo'); return; }
    S.nome = n; localStorage.setItem(LS_NOME, n); fecharModal(); render();
    if (!S.token) pedirToken();
  };
  $('#mNomeOk').onclick = ok;
  $('#mNome').onkeydown = e => { if (e.key === 'Enter') ok(); };
}

function pedirToken(msg) {
  if (!$('#modal').classList.contains('hidden') && $('#mToken')) return;
  abrirModal(`
    <h2>Chave de acesso</h2>
    ${msg ? `<p class="erro-txt">${esc(msg)}</p>` : ''}
    <p>Abra o <b>link de convite</b> que o gestor enviou, ou cole a chave abaixo.</p>
    <input id="mToken" type="password" autocomplete="off" placeholder="github_pat_...">
    <button class="btn primario grande" id="mTokenOk">Salvar</button>
    ${S.token ? '<button class="btn link" data-fechar>Cancelar</button>' : ''}`, !S.token);
  $('#mTokenOk').onclick = () => {
    const t = $('#mToken').value.trim(); if (!t) return;
    S.token = t; localStorage.setItem(LS_TOKEN, t); S.repoOk = false; fecharModal(); atualizar();
  };
}

function modalConfig() {
  const link = `${location.origin}${location.pathname}#token=${encodeURIComponent(S.token)}`;
  abrirModal(`
    <h2>Configurações</h2>
    <p>Usuário: <b>${esc(S.nome)}</b></p>
    <button class="btn sec" id="cTrocar">Trocar usuário</button>
    <hr>
    <p><b>Link de convite</b> — mande para a equipe. Quem abrir já fica com a chave salva.</p>
    <div class="add-linha"><input id="cLink" readonly value="${esc(link)}"><button class="btn primario" id="cCopiar">Copiar</button></div>
    <button class="btn sec" id="cToken">Alterar chave de acesso</button>
    <hr>
    <p class="legenda">Repositório: ${esc(C.OWNER)}/${esc(C.REPO)} · branch <code>${esc(C.BRANCH_DADOS)}</code><br>
    Pendentes de envio: ${S.fila.length}</p>
    <button class="btn sec" id="cSync">Sincronizar agora</button>
    <button class="btn link" data-fechar>Fechar</button>`);
  $('#cTrocar').onclick = () => { if (S.fila.length && !confirm('Há registros ainda não enviados. Trocar mesmo assim?')) return; localStorage.removeItem(LS_NOME); S.nome = ''; pedirNome(); };
  $('#cCopiar').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado'); } catch { $('#cLink').select(); document.execCommand('copy'); toast('Link copiado'); } };
  $('#cToken').onclick = () => { fecharModal(); pedirToken(); };
  $('#cSync').onclick = () => { fecharModal(); atualizar(); };
}

function modalConcluir(a) {
  abrirModal(`
    <h2>Concluir ${esc(a.tipo)}</h2>
    <label>Fim</label><input id="fFim" type="time" value="${agoraHM()}">
    <label>Distância (km) <small>opcional</small></label><input id="fKm" inputmode="decimal" value="${a.km != null ? fmtKm(a.km) : ''}">
    <label>Observação <small>opcional</small></label><textarea id="fObs" rows="2">${esc(a.obs)}</textarea>
    <button class="btn concluir grande" id="fOk">■ Concluir</button>
    <button class="btn link" data-fechar>Cancelar</button>`);
  const capturado = agoraHM();
  $('#fOk').onclick = () => {
    const fim = $('#fFim').value || capturado;
    const c = { fim, km: parseKm($('#fKm').value), obs: $('#fObs').value.trim() };
    // se a pessoa mudou o horário sugerido pelo sistema, registra no log
    if (fim !== capturado) c.hist = [...(a.hist || []), { em: agoraCompleto(), por: S.nome, campo: 'fim', de: capturado, para: fim }];
    enfileirar({ k: 'upd', mes: mesDe(a.data), id: a.id, c });
    fecharModal(); toast(`${a.tipo} concluído às ${fim}`);
  };
}

function modalEditar(a) {
  const novo = !a;
  a = a || { id: uid(), nome: S.nome, data: hoje(), tipo: '', alvo: '', inicio: '', fim: '', km: null, obs: '' };
  $('#listaTipos').innerHTML = C.TIPOS.map(t => `<option value="${esc(t.nome)}">`).join('');
  abrirModal(`
    <h2>${novo ? 'Registro manual' : 'Editar registro'}</h2>
    <label>Data</label><input id="eData" type="date" value="${a.data}">
    <label>Atividade</label><input id="eTipo" list="listaTipos" value="${esc(a.tipo)}" autocomplete="off">
    <label>Destino / equipe</label><input id="eAlvo" list="listaAlvos" value="${esc(a.alvo)}" autocomplete="off">
    <div class="duas"><div><label>Início</label><input id="eIni" type="time" value="${a.inicio}"></div>
    <div><label>Fim <small>vazio = em andamento</small></label><input id="eFim" type="time" value="${a.fim || ''}"></div></div>
    <label>Distância (km) <small>opcional</small></label><input id="eKm" inputmode="decimal" value="${a.km != null ? fmtKm(a.km) : ''}">
    <label>Observação <small>opcional</small></label><textarea id="eObs" rows="2">${esc(a.obs)}</textarea>
    <button class="btn primario grande" id="eOk">Salvar</button>
    ${novo ? '' : '<button class="btn perigo-btn" id="eDel">Excluir registro</button>'}
    <button class="btn link" data-fechar>Cancelar</button>`);
  $('#eOk').onclick = () => {
    const n = { data: $('#eData').value, tipo: $('#eTipo').value.trim(), alvo: $('#eAlvo').value.trim(), inicio: $('#eIni').value,
      fim: $('#eFim').value || null, km: parseKm($('#eKm').value), obs: $('#eObs').value.trim() };
    if (!n.data || !n.tipo || !n.inicio) { toast('Preencha data, atividade e início'); return; }
    if (!n.fim) {
      const outra = todasAtividades().find(x => x.nome === S.nome && !x.fim && x.id !== a.id);
      if (outra) { toast(`Já existe atividade em andamento (${outra.tipo}). Coloque um fim.`); return; }
    }
    if (novo) {
      n.hist = [{ em: agoraCompleto(), por: S.nome, acao: 'manual' }];
      enfileirar({ k: 'add', mes: mesDe(n.data), a: { ...a, ...n } });
    } else {
      const mud = diffHist(a, n);
      if (!mud.length) { fecharModal(); return; }
      n.hist = [...(a.hist || []), ...mud];
      if (mesDe(n.data) !== mesDe(a.data)) enfileirar({ k: 'del', mes: mesDe(a.data), id: a.id }, { k: 'add', mes: mesDe(n.data), a: { ...a, ...n } });
      else enfileirar({ k: 'upd', mes: mesDe(a.data), id: a.id, c: n });
    }
    fecharModal(); toast('Salvo');
  };
  if (!novo) $('#eDel').onclick = () => {
    if (!confirm('Excluir este registro?')) return;
    enfileirar({ k: 'del', mes: mesDe(a.data), id: a.id }); fecharModal(); toast('Excluído');
  };
}

let toastT;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 3200);
}

// ---------- eventos ----------
function ligar() {
  document.title = C.TITULO; $('#titulo').textContent = C.TITULO;
  $('#tipos').innerHTML = C.TIPOS.map(t => `<button class="chip tipo" data-tipo="${esc(t.nome)}">${t.icone || ''} ${esc(t.nome)}</button>`).join('')
    + `<button class="chip tipo" data-tipo="__outro">✏️ Outro</button>`;

  document.addEventListener('click', e => {
    const t = e.target.closest('button, [data-edit], .modal');
    if (!t) return;
    if (t.id === 'modal' && e.target === t) { if (!t.dataset.fixo) fecharModal(); return; }
    if (t.matches('[data-fechar]')) return fecharModal();
    if (t.dataset.aba) { S.aba = t.dataset.aba; render(); window.scrollTo(0, 0); return; }
    if (t.dataset.tipo) { S.tipo = S.tipo === t.dataset.tipo ? null : t.dataset.tipo; render(); if (S.tipo === '__outro') $('#tipoOutro').focus(); return; }
    if (t.dataset.alvo) { $('#alvo').value = t.dataset.alvo; return; }
    if (t.dataset.concluir) return concluir(t.dataset.concluir);
    if (t.dataset.log) { e.stopPropagation(); const a = todasAtividades().find(x => x.id === t.dataset.log); if (a) modalLog(a); return; }
    if (t.dataset.edit) { const a = todasAtividades().find(x => x.id === t.dataset.edit); if (a) modalEditar(a); return; }
    if (t.dataset.planoDia != null) { S.dataPlano = somaDias(hoje(), +t.dataset.planoDia); render(); atualizar(); return; }
    if (t.dataset.rm != null) { const l = meuPlano(S.dataPlano); l.splice(+t.dataset.rm, 1); salvarPlano(l); return; }
    if (t.dataset.sug) return addAlvo(t.dataset.sug);
  });
  $('#btnIniciar').onclick = iniciar;
  $('#btnManual').onclick = () => modalEditar(null);
  $('#btnAddAlvo').onclick = () => addAlvo($('#novoAlvo').value);
  $('#novoAlvo').onkeydown = e => { if (e.key === 'Enter') addAlvo($('#novoAlvo').value); };
  $('#dataPlano').onchange = e => { if (e.target.value) { S.dataPlano = e.target.value; render(); atualizar(); } };
  $('#dataEquipe').onchange = e => { if (e.target.value) { S.dataEquipe = e.target.value; render(); atualizar(); } };
  $('#eqAnt').onclick = () => { S.dataEquipe = somaDias(S.dataEquipe, -1); render(); atualizar(); };
  $('#eqProx').onclick = () => { S.dataEquipe = somaDias(S.dataEquipe, 1); render(); atualizar(); };
  $('#eqHoje').onclick = () => { S.dataEquipe = hoje(); render(); atualizar(); };
  $('#btnExportar').onclick = exportar;
  $('#btnUsuario').onclick = modalConfig;
  $('#status').onclick = () => { atualizar(); toast('Atualizando…'); };
  $('#listaEquipe').addEventListener('toggle', e => {
    const n = e.target.dataset?.nome; if (!n) return;
    e.target.open ? S.fechados.delete(n) : S.fechados.add(n);
  }, true);
  window.addEventListener('online', atualizar);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); atualizar(); } });
  setInterval(() => { if (document.visibilityState === 'visible') atualizar(); }, Math.max(5, C.INTERVALO_ATUALIZACAO) * 1000);
  setInterval(() => { if (document.visibilityState === 'visible' && $('#modal').classList.contains('hidden')) render(); }, 30000);
}

function init() {
  const p = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  const t = p.get('token') || q.get('token');
  if (t) { localStorage.setItem(LS_TOKEN, t.trim()); history.replaceState(null, '', location.pathname); }
  S.token = localStorage.getItem(LS_TOKEN) || C.TOKEN || '';
  ligar(); render();
  if (!S.nome) pedirNome();
  else if (!S.token) pedirToken();
  atualizar();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
})();
