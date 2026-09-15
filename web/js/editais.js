// Regras compartilhadas dos editais (site e painel): situação, datas e campos do formulário.
import { esc } from './comum.js';

export const AREA_PADRAO = 'Pesquisa, Extensão e Internacionalização';

export const TIPOS_CAMPO = {
  texto: 'Texto curto',
  paragrafo: 'Texto longo',
  email: 'E-mail',
  telefone: 'Telefone',
  cpf: 'CPF',
  numero: 'Número',
  data: 'Data',
  selecao: 'Lista de opções (escolhe uma)',
  caixas: 'Caixas de seleção (escolhe várias)',
  arquivo: 'Arquivo (PDF, JPG ou PNG)',
};

export const TIPOS_COM_OPCOES = ['selecao', 'caixas'];

export const SITUACOES_INSCRICAO = {
  recebida: 'Recebida',
  deferida: 'Deferida',
  indeferida: 'Indeferida',
  selecionada: 'Selecionada',
};

export const ROTULO_SITUACAO = { aberto: 'Inscrições abertas', em_breve: 'Em breve', encerrado: 'Encerrado' };

// A situação vem só do período; o banco confere de novo na hora da inscrição.
export function situacaoEdital(e, agora = new Date()) {
  if (e.inicio && agora < new Date(e.inicio)) return 'em_breve';
  if (e.fim && agora > new Date(e.fim)) return 'encerrado';
  return 'aberto';
}

export function fmtDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtPeriodo(e) {
  if (e.inicio && e.fim) return `${fmtDataHora(e.inicio)} a ${fmtDataHora(e.fim)}`;
  if (e.fim) return `até ${fmtDataHora(e.fim)}`;
  if (e.inicio) return `a partir de ${fmtDataHora(e.inicio)}`;
  return 'período não definido';
}

export function cpfValido(valor) {
  const d = String(valor).replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const TIPOS_MIME_ANEXO = ['application/pdf', 'image/jpeg', 'image/png'];
const LIMITE_ANEXO = 10 * 1024 * 1024;

// HTML de um campo do formulário público.
export function campoHtml(c) {
  const id = `campo-${c.id}`;
  const nome = esc(c.id);
  const obr = c.obrigatorio ? ' required' : '';
  const marca = c.obrigatorio ? ' <span class="obrigatorio" aria-hidden="true">*</span>' : '';
  const ajuda = c.ajuda ? `<small class="ajuda">${esc(c.ajuda)}</small>` : '';
  const rotulo = `<label for="${id}">${esc(c.rotulo)}${marca}</label>`;
  const opcoes = (c.opcoes ?? []).filter(Boolean);

  switch (c.tipo) {
    case 'paragrafo':
      return `<div class="campo">${rotulo}<textarea id="${id}" name="${nome}" rows="4"${obr}></textarea>${ajuda}</div>`;
    case 'selecao':
      return `<div class="campo">${rotulo}<select id="${id}" name="${nome}"${obr}>
        <option value="">Selecione…</option>${opcoes.map((o) => `<option>${esc(o)}</option>`).join('')}
      </select>${ajuda}</div>`;
    case 'caixas':
      return `<fieldset class="campo">
        <legend>${esc(c.rotulo)}${marca}</legend>
        ${opcoes.map((o) => `<label class="opcao"><input type="checkbox" name="${nome}" value="${esc(o)}"> ${esc(o)}</label>`).join('')}
        ${ajuda}
      </fieldset>`;
    case 'arquivo':
      return `<div class="campo">${rotulo}
        <input type="file" id="${id}" name="${nome}" accept=".pdf,.jpg,.jpeg,.png"${obr}>
        <small class="ajuda">${c.ajuda ? `${esc(c.ajuda)} · ` : ''}PDF, JPG ou PNG, até 10 MB.</small>
      </div>`;
    default: {
      const tipoInput = { email: 'email', telefone: 'tel', numero: 'number', data: 'date' }[c.tipo] ?? 'text';
      const extra =
        c.tipo === 'cpf' ? ' inputmode="numeric" placeholder="000.000.000-00" maxlength="14"'
        : c.tipo === 'telefone' ? ' placeholder="(91) 90000-0000"'
        : c.tipo === 'email' ? ' autocomplete="email"'
        : '';
      return `<div class="campo">${rotulo}<input type="${tipoInput}" id="${id}" name="${nome}"${extra}${obr}>${ajuda}</div>`;
    }
  }
}

function erroCampo(c, mensagem) {
  const erro = new Error(mensagem);
  erro.campo = c.id;
  return erro;
}

// Lê e valida o formulário: devolve { dados, arquivos: [{campo, file}] } ou lança o primeiro erro.
export function lerFormulario(form, campos) {
  const dados = {};
  const arquivos = [];
  const pega = (c) => form.querySelectorAll(`[name="${CSS.escape(c.id)}"]`);

  for (const c of campos) {
    if (c.tipo === 'arquivo') {
      const file = pega(c)[0]?.files?.[0];
      if (!file) {
        if (c.obrigatorio) throw erroCampo(c, `Envie o arquivo pedido em "${c.rotulo}".`);
        continue;
      }
      if (!TIPOS_MIME_ANEXO.includes(file.type)) throw erroCampo(c, `"${c.rotulo}": envie um arquivo PDF, JPG ou PNG.`);
      if (file.size > LIMITE_ANEXO) throw erroCampo(c, `"${c.rotulo}": o arquivo passa de 10 MB.`);
      arquivos.push({ campo: c.id, file });
    } else if (c.tipo === 'caixas') {
      const marcados = [...pega(c)].filter((i) => i.checked).map((i) => i.value);
      if (!marcados.length) {
        if (c.obrigatorio) throw erroCampo(c, `Marque ao menos uma opção em "${c.rotulo}".`);
        continue;
      }
      dados[c.id] = marcados;
    } else {
      const valor = (pega(c)[0]?.value ?? '').trim();
      if (!valor) {
        if (c.obrigatorio) throw erroCampo(c, `Preencha o campo "${c.rotulo}".`);
        continue;
      }
      if (c.tipo === 'cpf' && !cpfValido(valor)) throw erroCampo(c, `O CPF informado em "${c.rotulo}" não é válido.`);
      if (c.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
        throw erroCampo(c, `O e-mail informado em "${c.rotulo}" não é válido.`);
      }
      dados[c.id] = valor;
    }
  }
  return { dados, arquivos };
}
