/**
 * Conversão e formatação de valores de mercado no padrão do
 * Transfermarkt pt-BR: "€ 236.48 mi.", "€ 850 mil", "€ 1.20 bi".
 */

/** converte "€ 236.48 mi." em milhões (236.48); null se não for valor */
export function euroToMillions(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // atenção à ordem da alternância: "mil" antes de "mi",
  // senão "€ 700 mil" casaria como 700 milhões
  const m = raw.match(/€\s*([\d.,]+)\s*(bi|mil|mi)?/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (Number.isNaN(n)) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit === 'bi') return n * 1000;
  if (unit === 'mil') return n / 1000;
  return n;
}

/** formata milhões de volta para o padrão de exibição */
export function formatMillions(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  if (n >= 1000) return `€ ${(n / 1000).toFixed(2)} bi`;
  if (n >= 1) return `€ ${n.toFixed(2)} mi`;
  return `€ ${Math.round(n * 1000)} mil`;
}

/** soma uma lista de valores brutos ("€ x mi.") e formata o total */
export function sumValues(raws: (string | null | undefined)[]): string {
  let total = 0;
  let found = false;
  for (const raw of raws) {
    const v = euroToMillions(raw);
    if (v !== null) {
      total += v;
      found = true;
    }
  }
  return found ? formatMillions(total) : '—';
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function todayLabel(): string {
  const d = new Date();
  return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * "04/08 às 14h02" no fuso de Brasília, para o aviso de dado salvo.
 *
 * Formatado no servidor de propósito: se a data fosse montada no componente,
 * o fuso do navegador daria um texto diferente do renderizado no servidor e o
 * React acusaria erro de hidratação.
 */
export function rotuloAtualizacao(ms: number | null | undefined): string | null {
  if (!ms) return null;
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '';
  const dia = p('day');
  if (!dia) return null;
  return `${dia}/${p('month')} às ${p('hour')}h${p('minute')}`;
}
