import {useEffect, useState} from 'react';
import {Form, Link, redirect, useFetcher} from 'react-router';
import type {Route} from './+types/fantasy_.escalar';
import {getLeagueOverview, getRodadaAtual} from '~/lib/tm';
import {getCustomerId} from '~/lib/pro';
import {createDb} from '~/lib/db';
import {
  FORMACOES,
  MAX_PALPITE,
  acharFormacao,
  tamanhoEscalacao,
  validarEscalacao,
} from '~/lib/fantasy';
import {
  buscarEscalacao,
  buscarPerfil,
  obterOuCriarRodada,
  salvarEscalacao,
  type PickSalvo,
} from '~/lib/fantasy.server';

const LIGA = 'BRA1';

export const meta: Route.MetaFunction = () => [
  {title: 'Montar escalação · Game Fantasy · Players Place'},
];

export async function loader({context}: Route.LoaderArgs) {
  const cliente = await getCustomerId(context);
  if (!cliente) return redirect('/account/login');

  const db = createDb(context.env);
  if (!db) throw new Response('Game Fantasy indisponível agora.', {status: 503});

  // sem apelido o participante não teria como aparecer no ranking
  const perfil = await buscarPerfil(db, cliente.id);
  if (!perfil) return redirect('/fantasy/apelido');

  const [rodada, liga] = await Promise.all([
    getRodadaAtual(LIGA),
    getLeagueOverview(LIGA).catch(() => null),
  ]);

  const info = await obterOuCriarRodada(
    db,
    LIGA,
    rodada.season,
    rodada.round,
    rodada.firstKickoff,
  );

  const escalacao = await buscarEscalacao(
    db,
    cliente.id,
    LIGA,
    rodada.season,
    rodada.round,
  );

  return {
    round: rodada.round,
    season: rodada.season,
    deadlineISO: info?.deadlineISO ?? null,
    clubes: (liga?.clubs ?? []).map((c) => ({id: c.id, name: c.name})),
    escalacao,
  };
}

export async function action({request, context}: Route.ActionArgs) {
  const cliente = await getCustomerId(context);
  if (!cliente) return redirect('/account/login');

  const db = createDb(context.env);
  if (!db) return {erro: 'Banco indisponível.'};

  const form = await request.formData();
  const formacao = String(form.get('formacao') ?? '');
  const season = Number(form.get('season'));
  const round = Number(form.get('round'));

  let picks: PickSalvo[] = [];
  try {
    picks = JSON.parse(String(form.get('picks') ?? '[]')) as PickSalvo[];
  } catch {
    return {erro: 'Escalação em formato inválido.'};
  }

  const info = await obterOuCriarRodada(db, LIGA, season, round, null);
  if (!info) return {erro: 'Rodada sem prazo definido — não dá para salvar.'};

  const erros = validarEscalacao(
    formacao,
    picks.map((p) => ({
      playerId: p.playerId,
      predGoals: p.predGoals,
      predAssists: p.predAssists,
    })),
    info.deadlineISO,
    new Date(),
  );

  if (erros.length) {
    const e = erros[0];
    const msg: Record<string, string> = {
      'formacao-invalida': 'Formação inválida.',
      'quantidade-errada': 'A escalação precisa ter 11 jogadores.',
      'jogador-repetido': 'Há jogador repetido na escalação.',
      'palpite-invalido': `Palpites devem ser inteiros de 0 a ${MAX_PALPITE}.`,
      'prazo-encerrado': 'O prazo desta rodada já encerrou.',
    };
    return {erro: msg[e.tipo] ?? 'Escalação inválida.'};
  }

  const r = await salvarEscalacao(
    db,
    cliente.id,
    LIGA,
    season,
    round,
    formacao,
    picks,
  );
  return r.ok ? {ok: true} : {erro: r.erro ?? 'Falha ao salvar.'};
}

interface Slot {
  playerId: string;
  playerName: string;
  clubId: string | null;
  clubName: string | null;
  position: string | null;
  predGoals: number;
  predAssists: number;
}

const vazio = (): Slot => ({
  playerId: '',
  playerName: '',
  clubId: null,
  clubName: null,
  position: null,
  predGoals: 0,
  predAssists: 0,
});

/** +/- grandes o suficiente para o dedo, número no meio */
function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-[11px] font-bold tracking-wide text-faint uppercase">
        {label}
      </span>
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        onClick={() => onChange(Math.max(0, value - 1))}
        className="flex h-9 w-9 items-center justify-center rounded-btn border border-line text-lg font-bold disabled:opacity-30"
        disabled={value <= 0}
      >
        −
      </button>
      <span className="w-6 text-center text-sm font-extrabold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        onClick={() => onChange(Math.min(MAX_PALPITE, value + 1))}
        className="flex h-9 w-9 items-center justify-center rounded-btn border border-line text-lg font-bold disabled:opacity-30"
        disabled={value >= MAX_PALPITE}
      >
        +
      </button>
    </div>
  );
}

export default function Escalar({loaderData, actionData}: Route.ComponentProps) {
  const {round, deadlineISO, clubes, escalacao, season} = loaderData;
  const [formacao, setFormacao] = useState(escalacao?.formation ?? '4-3-3');
  const total = tamanhoEscalacao(acharFormacao(formacao) ?? FORMACOES[0]);

  const [slots, setSlots] = useState<Slot[]>(() => {
    const base = Array.from({length: total}, vazio);
    escalacao?.picks.forEach((p) => {
      if (p.slot - 1 < base.length) base[p.slot - 1] = {...p};
    });
    return base;
  });

  // trocar de formação mantém quem já foi escolhido, só ajusta o tamanho
  useEffect(() => {
    setSlots((atual) => {
      if (atual.length === total) return atual;
      if (atual.length > total) return atual.slice(0, total);
      return [...atual, ...Array.from({length: total - atual.length}, vazio)];
    });
  }, [total]);

  const [abrindo, setAbrindo] = useState<number | null>(null);
  const preenchidos = slots.filter((s) => s.playerId).length;
  const prazo = deadlineISO ? new Date(deadlineISO) : null;
  const encerrado = prazo ? Date.now() >= prazo.getTime() : false;

  const atualizar = (i: number, patch: Partial<Slot>) =>
    setSlots((s) => s.map((x, j) => (j === i ? {...x, ...patch} : x)));

  return (
    <div className="mx-auto max-w-2xl pp-in">
      <Link
        to="/fantasy"
        className="text-[13px] font-semibold text-pitch hover:underline"
      >
        ← Game Fantasy
      </Link>

      <h1 className="mt-3 font-display text-[26px] font-extrabold tracking-tight">
        {round}ª rodada
      </h1>
      <p className="mt-1 text-sm text-muted">
        {prazo
          ? `Você pode alterar até ${prazo.toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'America/Sao_Paulo',
            })}.`
          : 'Prazo desta rodada ainda não definido.'}
      </p>

      {encerrado ? (
        <p className="mt-4 rounded-card border border-line bg-card p-4 text-sm font-semibold">
          O prazo desta rodada encerrou. Sua escalação está travada.
        </p>
      ) : null}

      {actionData?.erro ? (
        <p className="mt-4 rounded-card border border-down/40 bg-down/10 p-4 text-sm font-semibold text-down">
          {actionData.erro}
        </p>
      ) : null}
      {actionData?.ok ? (
        <p className="mt-4 rounded-card border border-up/40 bg-up/10 p-4 text-sm font-semibold text-up">
          Escalação salva.
        </p>
      ) : null}

      {/* formação */}
      <div className="mt-6">
        <div className="text-[11px] font-bold tracking-wide text-faint uppercase">
          Formação
        </div>
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FORMACOES.map((f) => (
            <button
              key={f.code}
              type="button"
              disabled={encerrado}
              onClick={() => setFormacao(f.code)}
              className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-bold transition-colors disabled:opacity-40 ${
                formacao === f.code
                  ? 'bg-ink text-white'
                  : 'border border-line bg-card text-muted'
              }`}
            >
              {f.code}
            </button>
          ))}
        </div>
      </div>

      {/* slots */}
      <div className="mt-6 space-y-3">
        {slots.map((s, i) => (
          <div key={i} className="rounded-card border border-line bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-soft text-xs font-extrabold tabular-nums">
                {i + 1}
              </span>
              <button
                type="button"
                disabled={encerrado}
                onClick={() => setAbrindo(abrindo === i ? null : i)}
                className="min-w-0 flex-1 text-left disabled:opacity-40"
              >
                {s.playerId ? (
                  <>
                    <span className="block truncate text-sm font-bold">
                      {s.playerName}
                    </span>
                    <span className="block truncate text-xs text-faint">
                      {s.clubName} · {s.position}
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-semibold text-muted">
                    Escolher jogador
                  </span>
                )}
              </button>
              {s.playerId ? (
                <button
                  type="button"
                  disabled={encerrado}
                  onClick={() => atualizar(i, vazio())}
                  aria-label="Remover jogador"
                  className="shrink-0 text-xs font-semibold text-faint hover:text-down disabled:opacity-40"
                >
                  remover
                </button>
              ) : null}
            </div>

            {s.playerId && !encerrado ? (
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-innerline pt-3">
                <Stepper
                  label="Gols"
                  value={s.predGoals}
                  onChange={(v) => atualizar(i, {predGoals: v})}
                />
                <Stepper
                  label="Assist."
                  value={s.predAssists}
                  onChange={(v) => atualizar(i, {predAssists: v})}
                />
              </div>
            ) : null}

            {abrindo === i ? (
              <SeletorJogador
                clubes={clubes}
                jaEscalados={slots.map((x) => x.playerId).filter(Boolean)}
                onEscolher={(p) => {
                  atualizar(i, {
                    playerId: p.id,
                    playerName: p.name,
                    clubId: p.clubId,
                    clubName: p.clubName,
                    position: p.position,
                  });
                  setAbrindo(null);
                }}
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-card border border-dashed border-addash bg-card p-4 text-[13px] leading-relaxed text-muted">
        Palpite <strong className="text-ink">0</strong> vale &ldquo;não
        aposto&rdquo;: não soma nem tira ponto. Só número de 1 pra cima entra
        no jogo, e vale se acertar em cheio.
      </div>

      <Form method="post" className="mt-6">
        <input type="hidden" name="formacao" value={formacao} />
        <input type="hidden" name="season" value={season} />
        <input type="hidden" name="round" value={round} />
        <input
          type="hidden"
          name="picks"
          value={JSON.stringify(
            slots.map((s, i) => ({...s, slot: i + 1})).filter((s) => s.playerId),
          )}
        />
        <button
          type="submit"
          disabled={encerrado || preenchidos !== total}
          className="flex h-12 w-full items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {preenchidos === total
            ? 'Salvar escalação'
            : `Faltam ${total - preenchidos} jogadores`}
        </button>
      </Form>
    </div>
  );
}

interface JogadorEscolhido {
  id: string;
  name: string;
  position: string;
  clubId: string;
  clubName: string;
}

function SeletorJogador({
  clubes,
  jaEscalados,
  onEscolher,
}: {
  clubes: {id: string; name: string}[];
  jaEscalados: string[];
  onEscolher: (p: JogadorEscolhido) => void;
}) {
  const fetcher = useFetcher<{
    clubId: string;
    clubName: string;
    available: {id: string; name: string; position: string; number: string}[];
    out: {playerId: string; name: string; reason: string}[];
    erro?: string;
  }>();
  const [clube, setClube] = useState('');

  useEffect(() => {
    if (clube) fetcher.load(`/api/fantasy/elenco?clube=${clube}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clube]);

  const dados = fetcher.data;
  const escalados = new Set(jaEscalados);

  return (
    <div className="mt-3 border-t border-innerline pt-3">
      <select
        value={clube}
        onChange={(e) => setClube(e.target.value)}
        className="h-11 w-full rounded-btn border border-line bg-paper px-3 text-sm font-semibold"
      >
        <option value="">Escolha o clube…</option>
        {clubes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {fetcher.state !== 'idle' ? (
        <p className="mt-3 text-[13px] text-muted">Carregando elenco…</p>
      ) : null}

      {dados?.erro ? (
        <p className="mt-3 text-[13px] text-muted">{dados.erro}</p>
      ) : null}

      {dados?.available?.length ? (
        <>
          <div className="mt-3 max-h-64 overflow-y-auto rounded-btn border border-line">
            {dados.available.map((p) => {
              const usado = escalados.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={usado}
                  onClick={() =>
                    onEscolher({
                      id: p.id,
                      name: p.name,
                      position: p.position,
                      clubId: dados.clubId,
                      clubName: dados.clubName,
                    })
                  }
                  className="flex w-full items-center gap-3 border-b border-innerline px-3 py-2.5 text-left last:border-b-0 hover:bg-hoverrow disabled:opacity-35"
                >
                  <span className="w-6 text-center text-xs font-bold text-faint tabular-nums">
                    {p.number || '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {p.name}
                    </span>
                    <span className="block truncate text-xs text-faint">
                      {p.position}
                      {usado ? ' · já escalado' : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {dados.out?.length ? (
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              Fora da rodada:{' '}
              {dados.out.map((o) => `${o.name} (${o.reason})`).join(' · ')}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
