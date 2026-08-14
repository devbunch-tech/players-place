/**
 * De que loja é este checkout — a conferência antes de mexer em produção.
 *
 * POR QUE ELE EXISTE
 *
 * Nada no prompt do terminal diz em qual loja Shopify os comandos vão cair. Quem
 * decide isso é `.shopify/project.json`, um arquivo que `shopify hydrogen link`
 * reescreve sem cerimônia e que ninguém abre no dia a dia. Rodar um deploy na
 * loja errada é um erro silencioso até deixar de ser.
 *
 * Este script imprime, de uma vez, os três marcadores que identificam o
 * Players Place e SAI COM CÓDIGO 1 se qualquer um divergir — assim ele serve
 * tanto para olhar quanto para encadear: `npm run whoami && npm run deploy`.
 *
 * NÃO FAZ CHAMADA DE REDE
 *
 * Tudo o que ele lê está no disco. `shopify hydrogen env list` traria também os
 * ambientes remotos, mas exige sessão válida e alguns segundos — cedo demais
 * para uma checagem que se quer barata o bastante para rodar sempre.
 *
 * O `.env` LOCAL APONTA PARA A MOCK SHOP DE PROPÓSITO
 *
 * `PUBLIC_STORE_DOMAIN=mock.shop` no desenvolvimento não é engano: é o
 * `npm run dev` na porta 3000, sem tocar na loja real. Por isso o valor é
 * impresso como informação, e não comparado — só o vínculo em
 * `.shopify/project.json` decide para onde vai um deploy.
 */

import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

/** A identidade do Players Place. Se algum dia mudar, muda aqui — e só aqui. */
const ESPERADO = {
  remoto: 'git@github.com:devbunch-tech/players-place.git',
  loja: '00cpqa-z1.myshopify.com',
  storefront: 'gid://shopify/HydrogenStorefront/1000163202',
} as const;

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Lê um comando sem deixar que a falha dele derrube o relatório inteiro. */
function comando(bin: string, args: string[]): string | null {
  try {
    return execFileSync(bin, args, {cwd: raiz, encoding: 'utf8'}).trim();
  } catch {
    return null;
  }
}

type Projeto = {shop?: string; storefront?: {id?: string; title?: string}};

function lerProjeto(): Projeto {
  try {
    return JSON.parse(
      readFileSync(join(raiz, '.shopify/project.json'), 'utf8'),
    ) as Projeto;
  } catch {
    return {};
  }
}

/** O `PUBLIC_STORE_DOMAIN` do `.env`, sem depender de um parser de dotenv. */
function dominioLocal(): string | null {
  try {
    const env = readFileSync(join(raiz, '.env'), 'utf8');
    const linha = env.match(/^PUBLIC_STORE_DOMAIN\s*=\s*(.*)$/m);
    return linha ? linha[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

const projeto = lerProjeto();
const remoto = comando('git', ['remote', 'get-url', 'origin']);
const branch = comando('git', ['rev-parse', '--abbrev-ref', 'HEAD']);

const conferencias = [
  {rotulo: 'remoto git', achado: remoto, esperado: ESPERADO.remoto},
  {rotulo: 'loja Shopify', achado: projeto.shop ?? null, esperado: ESPERADO.loja},
  {
    rotulo: 'storefront',
    achado: projeto.storefront?.id ?? null,
    esperado: ESPERADO.storefront,
  },
];

// mesma convenção de `espelho.ts`: um ponto só de saída, um `disable` só
// eslint-disable-next-line no-console
const log = (msg = '') => console.log(msg);

const largura = Math.max(
  ...conferencias.map((c) => c.rotulo.length),
  'PUBLIC_STORE_DOMAIN'.length,
);
let divergiu = false;

log();
for (const {rotulo, achado, esperado} of conferencias) {
  const ok = achado === esperado;
  if (!ok) divergiu = true;
  log(`  ${ok ? '✓' : '✗'} ${rotulo.padEnd(largura)}  ${achado ?? '(não encontrado)'}`);
  if (!ok) log(`  ${' '.repeat(largura + 3)}esperado: ${esperado}`);
}

log();
log(`  · ${'branch'.padEnd(largura)}  ${branch ?? '(desconhecida)'}`);
log(
  `  · ${'PUBLIC_STORE_DOMAIN'.padEnd(largura)}  ${dominioLocal() ?? '(ausente)'}` +
    '  (local; mock.shop é o normal)',
);
log();

if (divergiu) {
  console.error(
    'ESTE NÃO É O PLAYERS PLACE. Não faça deploy daqui.\n' +
      'Se o vínculo se perdeu, refaça com: npx shopify hydrogen link\n',
  );
  process.exit(1);
}

log(`  Players Place confirmado — ${projeto.storefront?.title ?? ''}\n`);
