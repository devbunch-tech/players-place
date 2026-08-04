/**
 * Indicador global de carregamento.
 *
 * Cobre a página inteira com um véu translúcido e fica no centro **até a
 * navegação terminar** — não há tempo máximo. O véu também serve de barreira:
 * captura o clique e impede que o visitante acione algo na página que já está
 * saindo de cena.
 *
 * O que segura isso em pé é o stale-while-revalidate de `lib/tm/client.ts`:
 * com ele quase toda navegação responde em ~0,2 s. Sem aquilo, uma competição
 * com cache frio levava até 16 s, e travar a tela por todo esse tempo seria
 * pior do que não ter indicador nenhum.
 */
import {useEffect, useState} from 'react';
import {useNavigation} from 'react-router';

/**
 * Navegação instantânea não deve piscar a tela. Só aparece se a requisição
 * passar deste tempo — abaixo disso o visitante nem percebe que houve espera.
 */
const ATRASO_ATE_APARECER = 200;

export function BolaRolando() {
  const navigation = useNavigation();
  const carregando = navigation.state !== 'idle';
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!carregando) {
      setVisivel(false);
      return;
    }
    const aparecer = setTimeout(() => setVisivel(true), ATRASO_ATE_APARECER);
    return () => clearTimeout(aparecer);
    // `navigation.location.key` além de `carregando`: reinicia a contagem a
    // cada nova navegação em vez de ficar presa na primeira
  }, [carregando, navigation.location?.key]);

  if (!visivel) return null;

  return (
    <div
      // sem `pointer-events-none`: é justamente o véu que bloqueia o clique
      className="pp-in fixed inset-0 z-50 flex items-center justify-center bg-paper/75 backdrop-blur-[2px]"
      // `status` + `polite` anuncia para leitor de tela sem roubar o foco;
      // `aria-busy` diz que o conteúdo por baixo está em transição
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3">
        <Bola />
        <span className="text-sm font-bold text-ink">Bola rolando…</span>
      </div>
    </div>
  );
}

/**
 * Bola de futebol simplificada. O `circle` tem contorno próprio porque agora
 * ela fica sobre o véu claro, e uma bola branca sem borda sumiria no fundo.
 */
function Bola() {
  return (
    <svg
      className="pp-rolar"
      width="52"
      height="52"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10.6"
        fill="#fff"
        stroke="var(--color-ink, #131711)"
        strokeWidth="1.2"
      />
      <path
        d="M12 6.4l3.6 2.6-1.4 4.2H9.8L8.4 9z"
        fill="var(--color-ink, #131711)"
      />
      <g stroke="var(--color-ink, #131711)" strokeWidth="1.4" fill="none">
        <path d="M12 6.4V2.2M15.6 9l4-1.3M14.2 13.2l2.5 3.4M9.8 13.2l-2.5 3.4M8.4 9l-4-1.3" />
      </g>
    </svg>
  );
}
