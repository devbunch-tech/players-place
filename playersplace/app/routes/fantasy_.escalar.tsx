import {useEffect, useMemo, useState} from 'react';
import {Form, Link, redirect, useFetcher} from 'react-router';
import type {Route} from './+types/fantasy_.escalar';
import {getLeagueOverview, getRodadaAtual} from '~/lib/tm';
import {getCustomerId} from '~/lib/pro';
import {createDb} from '~/lib/db';
import {
  FORMACOES,
  MAX_PALPITE,
  acharFormacao,
  posicoesDaFormacao,
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
// import direto (e não pelo barril `~/lib/tm`) para não arrastar o parser de
// HTML do Transfermarkt para o bundle do cliente
import {
  ehSuspensao,
  NOME_SETOR,
  setorDaPosicao,
  setorDaVaga,
  type Setor,
} from '~/lib/tm/positions';
import {FantasyPitch, type VagaCampo} from '~/components/FantasyPitch';

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

interface Vaga {
  playerId: string;
  playerName: string;
  clubId: string | null;
  clubName: string | null;
  position: string | null;
  photo: string | null;
  predGoals: number;
  predAssists: number;
}

/** +/- grandes o suficiente para o dedo, número no meio */
function Stepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-[11px] font-bold tracking-wide text-faint uppercase">
        {label}
      </span>
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
        className="flex h-10 w-10 items-center justify-center rounded-btn border border-line text-lg font-bold disabled:opacity-30"
      >
        −
      </button>
      <span className="w-7 text-center text-base font-extrabold tabular-nums">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        onClick={() => onChange(Math.min(MAX_PALPITE, value + 1))}
        disabled={disabled || value >= MAX_PALPITE}
        className="flex h-10 w-10 items-center justify-center rounded-btn border border-line text-lg font-bold disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export default function Escalar({loaderData, actionData}: Route.ComponentProps) {
  const {round, deadlineISO, clubes, escalacao, season} = loaderData;

  const [formacaoCode, setFormacaoCode] = useState(
    escalacao?.formation ?? '4-3-3',
  );
  const formacao = acharFormacao(formacaoCode) ?? FORMACOES[0];
  const total = tamanhoEscalacao(formacao);

  // indexado por slot (1..11): trocar de formação preserva quem já foi escolhido
  const [vagas, setVagas] = useState<Record<number, Vaga>>(() => {
    const inicial: Record<number, Vaga> = {};
    escalacao?.picks.forEach((p) => {
      inicial[p.slot] = {
        playerId: p.playerId,
        playerName: p.playerName,
        clubId: p.clubId,
        clubName: p.clubName,
        position: p.position,
        photo: p.photo,
        predGoals: p.predGoals,
        predAssists: p.predAssists,
      };
    });
    return inicial;
  });

  const [slotAtivo, setSlotAtivo] = useState<number | null>(null);
  const [trocando, setTrocando] = useState(false);

  const prazo = deadlineISO ? new Date(deadlineISO) : null;
  const encerrado = prazo ? Date.now() >= prazo.getTime() : false;

  const posicoes = posicoesDaFormacao(formacao);
  const preenchidos = posicoes.filter((p) => vagas[p.slot]).length;
  const jaEscalados = useMemo(
    () =>
      posicoes.map((p) => vagas[p.slot]?.playerId).filter(Boolean) as string[],
    [posicoes, vagas],
  );

  const posicaoAtiva = posicoes.find((p) => p.slot === slotAtivo) ?? null;
  const vagaAtiva = slotAtivo ? vagas[slotAtivo] : undefined;

  // vaga vazia já abre no seletor; vaga preenchida abre nos palpites
  useEffect(() => {
    setTrocando(!vagaAtiva);
  }, [slotAtivo, vagaAtiva]);

  const atualizar = (slot: number, patch: Partial<Vaga>) =>
    setVagas((v) => ({...v, [slot]: {...v[slot], ...patch}}));

  const paraEnvio = posicoes
    .filter((p) => vagas[p.slot])
    .map((p) => ({...vagas[p.slot], slot: p.slot}));

  const vagasCampo: Record<number, VagaCampo | undefined> = {};
  for (const p of posicoes) {
    const v = vagas[p.slot];
    if (v) {
      vagasCampo[p.slot] = {
        playerId: v.playerId,
        playerName: v.playerName,
        photo: v.photo,
        predGoals: v.predGoals,
        predAssists: v.predAssists,
      };
    }
  }

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
              onClick={() => {
                setFormacaoCode(f.code);
                setSlotAtivo(null);
              }}
              className={`h-9 shrink-0 rounded-full px-4 text-[13px] font-bold transition-colors disabled:opacity-40 ${
                formacaoCode === f.code
                  ? 'bg-ink text-white'
                  : 'border border-line bg-card text-muted'
              }`}
            >
              {f.code}
            </button>
          ))}
        </div>
      </div>

      {/* campo */}
      <div className="mt-4 rounded-card border border-line bg-card p-4">
        <FantasyPitch
          formacao={formacao}
          vagas={vagasCampo}
          slotAtivo={slotAtivo}
          onSelecionar={(s) => setSlotAtivo(slotAtivo === s ? null : s)}
          desabilitado={encerrado}
        />
        <p className="mt-3 text-center text-[13px] font-semibold text-muted">
          {preenchidos}/{total} escalados
          {slotAtivo ? '' : ' · toque numa posição para escolher'}
        </p>
      </div>

      {/* editor da vaga selecionada */}
      {posicaoAtiva ? (
        <div className="mt-4 rounded-card border border-line bg-card p-4">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-chipbg px-3 py-1 text-[11px] font-extrabold tracking-wide">
              {posicaoAtiva.rotulo} · vaga {posicaoAtiva.slot}
            </span>
            <button
              type="button"
              onClick={() => setSlotAtivo(null)}
              className="ml-auto text-xs font-semibold text-faint hover:text-ink"
            >
              fechar
            </button>
          </div>

          {vagaAtiva && !trocando ? (
            <>
              <div className="mt-3 flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {vagaAtiva.playerName}
                  </span>
                  <span className="block truncate text-xs text-faint">
                    {vagaAtiva.clubName} · {vagaAtiva.position}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={encerrado}
                  onClick={() => setTrocando(true)}
                  className="shrink-0 text-xs font-semibold text-pitch hover:underline disabled:opacity-40"
                >
                  trocar
                </button>
                <button
                  type="button"
                  disabled={encerrado}
                  onClick={() =>
                    setVagas((v) => {
                      const copia = {...v};
                      delete copia[posicaoAtiva.slot];
                      return copia;
                    })
                  }
                  className="shrink-0 text-xs font-semibold text-faint hover:text-down disabled:opacity-40"
                >
                  remover
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3 border-t border-innerline pt-3">
                <Stepper
                  label="Gols"
                  value={vagaAtiva.predGoals}
                  disabled={encerrado}
                  onChange={(v) => atualizar(posicaoAtiva.slot, {predGoals: v})}
                />
                <Stepper
                  label="Assist."
                  value={vagaAtiva.predAssists}
                  disabled={encerrado}
                  onChange={(v) =>
                    atualizar(posicaoAtiva.slot, {predAssists: v})
                  }
                />
              </div>
            </>
          ) : (
            <SeletorJogador
              clubes={clubes}
              jaEscalados={jaEscalados}
              setor={setorDaVaga(posicaoAtiva.rotulo)}
              onEscolher={(p) => {
                setVagas((v) => ({
                  ...v,
                  [posicaoAtiva.slot]: {
                    playerId: p.id,
                    playerName: p.name,
                    clubId: p.clubId,
                    clubName: p.clubName,
                    position: p.position,
                    photo: p.photo,
                    predGoals: v[posicaoAtiva.slot]?.predGoals ?? 0,
                    predAssists: v[posicaoAtiva.slot]?.predAssists ?? 0,
                  },
                }));
                setTrocando(false);
              }}
            />
          )}
        </div>
      ) : null}

      <div className="mt-4 rounded-card border border-dashed border-addash bg-card p-4 text-[13px] leading-relaxed text-muted">
        Palpite <strong className="text-ink">0</strong> vale &ldquo;não
        aposto&rdquo;: não soma nem tira ponto. Só número de 1 pra cima entra no
        jogo, e vale se acertar em cheio.
      </div>

      <Form method="post" className="mt-6">
        <input type="hidden" name="formacao" value={formacaoCode} />
        <input type="hidden" name="season" value={season} />
        <input type="hidden" name="round" value={round} />
        <input type="hidden" name="picks" value={JSON.stringify(paraEnvio)} />
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
  photo: string | null;
  clubId: string;
  clubName: string;
}

/** ícone de bloqueio: cruz para lesão, cartão para suspensão */
function IconeFora({suspenso}: {suspenso: boolean}) {
  return suspenso ? (
    <span
      aria-hidden
      className="inline-block h-3.5 w-2.5 shrink-0 rounded-[2px] bg-down"
    />
  ) : (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="shrink-0 text-down"
    >
      <path
        d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7V3z"
        fill="currentColor"
      />
    </svg>
  );
}

function SeletorJogador({
  clubes,
  jaEscalados,
  setor,
  onEscolher,
}: {
  clubes: {id: string; name: string}[];
  jaEscalados: string[];
  setor: Setor;
  onEscolher: (p: JogadorEscolhido) => void;
}) {
  const fetcher = useFetcher<{
    clubId: string;
    clubName: string;
    available: {
      id: string;
      name: string;
      position: string;
      number: string;
      photo: string | null;
    }[];
    out: {
      playerId: string;
      name: string;
      position: string;
      reason: string;
    }[];
    erro?: string;
  }>();
  const [clube, setClube] = useState('');

  useEffect(() => {
    if (clube) fetcher.load(`/api/fantasy/elenco?clube=${clube}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clube]);

  const dados = fetcher.data;
  const escalados = new Set(jaEscalados);

  /**
   * Elenco e desfalques na mesma lista, já restrita ao setor da vaga: um
   * goleiro não pode ocupar uma vaga de ataque. Posição que o parser não
   * souber classificar entra assim mesmo — bloquear por desconhecimento
   * deixaria o usuário sem conseguir escalar.
   */
  const doSetor = <T extends {position: string}>(itens: T[] | undefined) =>
    (itens ?? []).filter((p) => {
      const s = setorDaPosicao(p.position);
      return s === null || s === setor;
    });

  const disponiveis = doSetor(dados?.available);
  const fora = doSetor(dados?.out);
  const carregado = fetcher.state === 'idle' && !!dados && !dados.erro;

  return (
    <div className="mt-3 border-t border-innerline pt-3">
      <select
        value={clube}
        onChange={(e) => setClube(e.target.value)}
        aria-label={`Clube para escolher entre os ${NOME_SETOR[setor]}`}
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

      {carregado && !disponiveis.length && !fora.length ? (
        <p className="mt-3 text-[13px] text-muted">
          Nenhum {NOME_SETOR[setor].replace(/e?s$/, '')} disponível neste clube.
        </p>
      ) : null}

      {disponiveis.length || fora.length ? (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-btn border border-line">
          {disponiveis.map((p) => {
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
                    photo: p.photo,
                    clubId: dados!.clubId,
                    clubName: dados!.clubName,
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

          {/* desfalques ficam na lista, visíveis e travados: sumir com eles
              faz o usuário procurar um jogador que simplesmente não aparece */}
          {fora.map((o) => {
            const suspenso = ehSuspensao(o.reason);
            return (
              <div
                key={o.playerId}
                aria-disabled
                title={o.reason}
                className="flex w-full cursor-not-allowed items-center gap-3 border-b border-innerline bg-soft px-3 py-2.5 text-left opacity-60 last:border-b-0"
              >
                <span className="flex w-6 justify-center">
                  <IconeFora suspenso={suspenso} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold line-through">
                    {o.name}
                  </span>
                  <span className="block truncate text-xs text-down">
                    {suspenso ? 'Suspenso' : 'Lesionado'} · {o.reason}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
