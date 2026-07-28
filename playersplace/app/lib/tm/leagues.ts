/**
 * Registro das ligas disponíveis na plataforma.
 * `code` é o identificador da competição no Transfermarkt.
 */
export type Region =
  | 'Europa'
  | 'América do Sul'
  | 'América do Norte'
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
  {code: 'GB1', name: 'Premier League', country: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', region: 'Europa', short: 'PL', color: '#3D195B'},
  {code: 'ES1', name: 'LaLiga', country: 'Espanha', flag: '🇪🇸', region: 'Europa', short: 'LL', color: '#A50044'},
  {code: 'IT1', name: 'Serie A', country: 'Itália', flag: '🇮🇹', region: 'Europa', short: 'SA', color: '#1565C0'},
  {code: 'L1', name: 'Bundesliga', country: 'Alemanha', flag: '🇩🇪', region: 'Europa', short: 'BL', color: '#D3010C'},
  {code: 'NL1', name: 'Eredivisie', country: 'Holanda', flag: '🇳🇱', region: 'Europa', short: 'ER', color: '#D6581F'},
  {code: 'DK1', name: 'Superligaen', country: 'Dinamarca', flag: '🇩🇰', region: 'Europa', short: 'SL', color: '#8B1A2B'},
  {code: 'SE1', name: 'Allsvenskan', country: 'Suécia', flag: '🇸🇪', region: 'Europa', short: 'AS', color: '#005BAA'},
  {code: 'ARGC', name: 'Torneo Clausura', country: 'Argentina', flag: '🇦🇷', region: 'América do Sul', short: 'AR', color: '#2E64A1'},
  {code: 'COL1', name: 'Liga Dimayor', country: 'Colômbia', flag: '🇨🇴', region: 'América do Sul', short: 'CO', color: '#B67B0F'},
  {code: 'EC1N', name: 'LigaPro Serie A', country: 'Equador', flag: '🇪🇨', region: 'América do Sul', short: 'EC', color: '#C09E1B'},
  {code: 'MLS1', name: 'Major League Soccer', country: 'Estados Unidos', flag: '🇺🇸', region: 'América do Norte', short: 'ML', color: '#C39BD3'},
  {code: 'CDN1', name: 'Canadian Premier League', country: 'Canadá', flag: '🇨🇦', region: 'América do Norte', short: 'CP', color: '#AD1F2D'},
  {code: 'SA1', name: 'Saudi Pro League', country: 'Arábia Saudita', flag: '🇸🇦', region: 'Oriente Médio', short: 'SP', color: '#165D31'},
  {code: 'QSL', name: 'Qatar Stars League', country: 'Catar', flag: '🇶🇦', region: 'Oriente Médio', short: 'QS', color: '#722F37'},
];

export const REGIONS: Region[] = [
  'Europa',
  'América do Sul',
  'América do Norte',
  'Oriente Médio',
];

export function findLeague(code: string): League | undefined {
  return LEAGUES.find((l) => l.code === code);
}

/** logo oficial da competição no CDN do Transfermarkt (150×150) */
export function leagueLogo(code: string): string {
  return `https://tmssl.akamaized.net/images/logo/homepageWappen150x150/${code.toLowerCase()}.png`;
}
