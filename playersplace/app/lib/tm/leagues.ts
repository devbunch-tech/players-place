/**
 * Registro das ligas disponíveis na plataforma.
 * `code` é o identificador da competição no Transfermarkt.
 */
export type Region =
  | 'Europa'
  | 'América do Sul'
  | 'América do Norte'
  | 'Ásia'
  | 'Oriente Médio';

export interface League {
  code: string;
  name: string;
  country: string;
  flag: string;
  region: Region;
  /** sigla exibida no monograma */
  short: string;
  /** cor do monograma */
  color: string;
}

export const LEAGUES: League[] = [
  {code: 'BRA1', name: 'Brasileirão Série A', country: 'Brasil', flag: '🇧🇷', region: 'América do Sul', short: 'BR', color: '#0B7A3B'},
  {code: 'BRA2', name: 'Brasileirão Série B', country: 'Brasil', flag: '🇧🇷', region: 'América do Sul', short: 'B2', color: '#1B5E20'},
  {code: 'GB1', name: 'Premier League', country: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', region: 'Europa', short: 'PL', color: '#3D195B'},
  {code: 'ES1', name: 'LaLiga', country: 'Espanha', flag: '🇪🇸', region: 'Europa', short: 'LL', color: '#A50044'},
  {code: 'IT1', name: 'Serie A', country: 'Itália', flag: '🇮🇹', region: 'Europa', short: 'SA', color: '#1565C0'},
  {code: 'L1', name: 'Bundesliga', country: 'Alemanha', flag: '🇩🇪', region: 'Europa', short: 'BL', color: '#D3010C'},
  {code: 'NL1', name: 'Eredivisie', country: 'Holanda', flag: '🇳🇱', region: 'Europa', short: 'ER', color: '#D6581F'},
  {code: 'DK1', name: 'Superligaen', country: 'Dinamarca', flag: '🇩🇰', region: 'Europa', short: 'SL', color: '#8B1A2B'},
  {code: 'SE1', name: 'Allsvenskan', country: 'Suécia', flag: '🇸🇪', region: 'Europa', short: 'AS', color: '#005BAA'},
  {code: 'FR1', name: 'Ligue 1', country: 'França', flag: '🇫🇷', region: 'Europa', short: 'L1', color: '#091C3E'},
  {code: 'ARGC', name: 'Torneo Clausura', country: 'Argentina', flag: '🇦🇷', region: 'América do Sul', short: 'AR', color: '#2E64A1'},
  {code: 'COL1', name: 'Liga Dimayor', country: 'Colômbia', flag: '🇨🇴', region: 'América do Sul', short: 'CO', color: '#B67B0F'},
  {code: 'EC1N', name: 'LigaPro Serie A', country: 'Equador', flag: '🇪🇨', region: 'América do Sul', short: 'EC', color: '#C09E1B'},
  {code: 'CLPD', name: 'Liga de Primera', country: 'Chile', flag: '🇨🇱', region: 'América do Sul', short: 'CH', color: '#0F3B7A'},
  // Peru joga em turnos: TDeC é o Clausura. O Apertura tem outro código, do
  // mesmo jeito que a Argentina (ARGC/ARG1) — trocar a cada semestre.
  {code: 'TDeC', name: 'Liga 1 Clausura', country: 'Peru', flag: '🇵🇪', region: 'América do Sul', short: 'PE', color: '#A8202E'},
  {code: 'MLS1', name: 'Major League Soccer', country: 'Estados Unidos', flag: '🇺🇸', region: 'América do Norte', short: 'ML', color: '#C39BD3'},
  {code: 'CDN1', name: 'Canadian Premier League', country: 'Canadá', flag: '🇨🇦', region: 'América do Norte', short: 'CP', color: '#AD1F2D'},
  {code: 'JAP1', name: 'J1 League', country: 'Japão', flag: '🇯🇵', region: 'Ásia', short: 'J1', color: '#C8102E'},
  {code: 'CSL', name: 'Chinese Super League', country: 'China', flag: '🇨🇳', region: 'Ásia', short: 'CN', color: '#B8232F'},
  {code: 'SA1', name: 'Saudi Pro League', country: 'Arábia Saudita', flag: '🇸🇦', region: 'Oriente Médio', short: 'SP', color: '#165D31'},
  {code: 'QSL', name: 'Qatar Stars League', country: 'Catar', flag: '🇶🇦', region: 'Oriente Médio', short: 'QS', color: '#722F37'},
];

export const REGIONS: Region[] = [
  'Europa',
  'América do Sul',
  'América do Norte',
  'Ásia',
  'Oriente Médio',
];

/**
 * Acha a liga sem diferenciar maiúsculas — mas o `code` devolvido é o
 * canônico, e é ele que deve ir para o Transfermarkt.
 *
 * O detalhe importa: a origem **diferencia caixa**. `TDeC` (Peru) responde
 * 200, `TDEC` responde 302 e a página morre em 502. Como todos os outros
 * códigos são naturalmente maiúsculos, o `toUpperCase()` das rotas passou
 * despercebido até a primeira liga com letra minúscula no meio.
 */
export function findLeague(code: string): League | undefined {
  const alvo = code.toUpperCase();
  return LEAGUES.find((l) => l.code.toUpperCase() === alvo);
}

/** logo oficial da competição no CDN do Transfermarkt (150×150) */
export function leagueLogo(code: string): string {
  return `https://tmssl.akamaized.net/images/logo/homepageWappen150x150/${code.toLowerCase()}.png`;
}
