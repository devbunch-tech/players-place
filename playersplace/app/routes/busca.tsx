import {Form, Link} from 'react-router';
import type {Route} from './+types/busca';
import {searchAll} from '~/lib/tm';
import {Avatar, Crest, EmptyNote, SectionTitle} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';

export const meta: Route.MetaFunction = ({data}) => [
  {
    title: data?.q
      ? `“${data.q}” · Busca · Players Place`
      : 'Busca · Players Place',
  },
];

export async function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  if (!q) return {q: '', results: null};
  const results = await searchAll(q).catch(() => null);
  return {q, results};
}

export default function Busca({loaderData}: Route.ComponentProps) {
  const {q, results} = loaderData;
  return (
    <div className="pp-in">
      <h1 className="font-display text-[26px] font-extrabold tracking-tight">
        Busca
      </h1>
      <Form method="get" className="mt-4 max-w-xl">
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Nome do jogador ou clube…"
          className="h-12 w-full rounded-full border border-line bg-card px-5 text-[15px] outline-none placeholder:text-faint focus:border-pitch"
        />
      </Form>

      {!q ? (
        <p className="mt-6 text-sm text-muted">
          Pesquise por qualquer jogador ou clube — por exemplo,{' '}
          <Link to="/busca?q=neymar" className="font-semibold text-pitch">
            “neymar”
          </Link>{' '}
          ou{' '}
          <Link to="/busca?q=flamengo" className="font-semibold text-pitch">
            “flamengo”
          </Link>
          .
        </p>
      ) : !results || (results.players.length === 0 && results.clubs.length === 0) ? (
        <div className="mt-6 max-w-xl">
          <EmptyNote>
            Nada encontrado para <strong>“{q}”</strong>. Confira a grafia ou
            tente outro termo.
          </EmptyNote>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
          <div className="space-y-10">
            {results.players.length > 0 ? (
              <section>
                <SectionTitle>Jogadores</SectionTitle>
                <div className="overflow-hidden rounded-card border border-line bg-card">
                  {results.players.map((p) => (
                    <Link
                      key={p.id}
                      to={`/jogadores/${p.id}`}
                      className="flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0 hover:bg-hoverrow"
                    >
                      <Avatar src={p.photo} name={p.name} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{p.name}</div>
                        <div className="truncate text-xs text-faint">{p.club}</div>
                      </div>
                      <span className="text-sm font-extrabold tabular-nums">
                        {p.value || ''}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            {results.clubs.length > 0 ? (
              <section>
                <SectionTitle>Clubes</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.clubs.map((c) => (
                    <Link
                      key={c.id}
                      to={`/clubes/${c.id}`}
                      className="flex items-center gap-3 rounded-card border border-line bg-card p-4 hover:bg-hoverrow"
                    >
                      <Crest src={c.crest} name={c.name} size={32} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{c.name}</div>
                        <div className="truncate text-xs text-faint">{c.country}</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
          <aside className="space-y-6">
            <AdSlot />
            <ProCard />
          </aside>
        </div>
      )}
    </div>
  );
}
