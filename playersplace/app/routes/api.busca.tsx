/**
 * Sugestões da busca inteligente (consumida pelo componente SmartSearch).
 *
 * Rota de recurso: só devolve JSON, não tem componente. O cache do
 * Transfermarkt já é compartilhado com a página /busca, então digitar aqui
 * aquece a busca completa e vice-versa.
 */
import {searchAll} from '~/lib/tm';

/** abaixo disto não consultamos a origem — evita rajada de request por tecla */
const MIN_CHARS = 4;
const MAX_PLAYERS = 6;
const MAX_CLUBS = 3;

export async function loader({request}: {request: Request}) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();

  if (q.length < MIN_CHARS) {
    return Response.json(
      {q, players: [], clubs: [], tooShort: true},
      {headers: {'Cache-Control': 'no-store'}},
    );
  }

  try {
    const {players, clubs} = await searchAll(q);
    return Response.json(
      {
        q,
        players: players.slice(0, MAX_PLAYERS),
        clubs: clubs.slice(0, MAX_CLUBS),
        tooShort: false,
      },
      // as sugestões podem ficar no cache do navegador por pouco tempo:
      // a mesma consulta repetida enquanto o usuário corrige a digitação
      // não precisa voltar à origem
      {headers: {'Cache-Control': 'public, max-age=60'}},
    );
  } catch {
    return Response.json(
      {q, players: [], clubs: [], erro: true},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
