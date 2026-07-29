import {PitchMarkings} from '~/components/PositionsPitch';
import {posicoesDaFormacao, type Formacao} from '~/lib/fantasy';

/**
 * Campo da escalação: as 11 vagas desenhadas na posição da formação.
 *
 * Vaga vazia mostra o rótulo (GOL, ZAG, MEI, ATA); vaga preenchida mostra a
 * foto do jogador. O palpite de gols e assistências aparece como um selinho
 * no canto, para o usuário conferir a escalação inteira sem abrir cada uma.
 *
 * Reaproveita as linhas do campo de "Posições em que jogou" para o Fantasy
 * não parecer outro produto.
 */

export interface VagaCampo {
  playerId: string;
  playerName: string;
  photo: string | null;
  predGoals: number;
  predAssists: number;
}

/** duas primeiras letras de cada palavra — cabe no círculo */
function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

export function FantasyPitch({
  formacao,
  vagas,
  slotAtivo,
  onSelecionar,
  desabilitado = false,
}: {
  formacao: Formacao;
  /** indexado por slot (1..11) */
  vagas: Record<number, VagaCampo | undefined>;
  slotAtivo: number | null;
  onSelecionar: (slot: number) => void;
  desabilitado?: boolean;
}) {
  const posicoes = posicoesDaFormacao(formacao);

  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-[380px] overflow-hidden rounded-[12px] bg-pitch">
      <PitchMarkings />

      {posicoes.map((p) => {
        const vaga = vagas[p.slot];
        const ativo = slotAtivo === p.slot;
        const temPalpite = vaga && (vaga.predGoals > 0 || vaga.predAssists > 0);

        return (
          <button
            key={p.slot}
            type="button"
            disabled={desabilitado}
            onClick={() => onSelecionar(p.slot)}
            aria-label={
              vaga
                ? `${p.rotulo}: ${vaga.playerName}. Alterar.`
                : `${p.rotulo}: vaga vazia. Escolher jogador.`
            }
            aria-pressed={ativo}
            className="absolute -translate-x-1/2 -translate-y-1/2 disabled:cursor-not-allowed"
            style={{left: `${p.x}%`, top: `${p.y}%`}}
          >
            {/* o selinho fica FORA do círculo: o círculo precisa de
                overflow-hidden para recortar a foto, e isso cortaria o selo */}
            <span className="relative block">
              <span
                className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full font-display text-[11px] font-extrabold ${
                  vaga
                    ? 'bg-white text-pitch'
                    : 'border border-dashed border-white/40 bg-white/10 text-white/70'
                } ${ativo ? 'ring-[3px] ring-lime' : 'ring-[3px] ring-white/10'}`}
              >
                {vaga?.photo ? (
                  <img
                    src={vaga.photo}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : vaga ? (
                  iniciais(vaga.playerName)
                ) : (
                  p.rotulo
                )}
              </span>

              {temPalpite ? (
                <span className="absolute -top-1.5 -right-2 rounded-full bg-lime px-1.5 py-px text-[10px] font-extrabold text-ink tabular-nums">
                  {vaga.predGoals}/{vaga.predAssists}
                </span>
              ) : null}
            </span>

            {vaga ? (
              <span className="mt-1 block max-w-[62px] truncate text-center text-[9px] font-bold text-white/90">
                {vaga.playerName}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
