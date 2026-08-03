/**
 * Indicador global de carregamento.
 *
 * Aparece em qualquer navegação entre rotas e some sozinho após
 * `DURACAO_MAXIMA`, mesmo que a página ainda não tenha chegado — foi assim que
 * o comportamento foi pedido.
 *
 * Isso só é razoável por causa do stale-while-revalidate em `lib/tm/client.ts`:
 * com ele as páginas respondem em ~0,2 s e passar de 3 s virou exceção. Sem
 * aquilo, uma competição com cache frio levava até 16 s, e o indicador sumindo
 * aos 3 deixaria o visitante diante de uma tela aparentemente travada.
 */
import {useEffect, useState} from 'react';
import {useNavigation} from 'react-router';

/** o indicador se esconde depois disto, com ou sem a página pronta */
const DURACAO_MAXIMA = 3000;

/**
 * Navegação instantânea não deve piscar a bola na tela. Só mostra se a
 * requisição passar deste tempo.
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
    const esconder = setTimeout(() => setVisivel(false), DURACAO_MAXIMA);
    return () => {
      clearTimeout(aparecer);
      clearTimeout(esconder);
    };
    // `navigation.location` no lugar de só `carregando`: assim o cronômetro
    // reinicia a cada nova navegação, e não fica preso na primeira.
  }, [carregando, navigation.location?.key]);

  if (!visivel) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
      // anuncia para leitor de tela sem roubar o foco de quem está navegando
      role="status"
      aria-live="polite"
    >
      <div className="pp-in flex items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-white shadow-lg">
        <Bola />
        <span className="text-[13px] font-bold">Bola rolando…</span>
      </div>
    </div>
  );
}

/** bola de futebol simplificada: legível a 16px, ao contrário de uma real */
function Bola() {
  return (
    <svg
      className="pp-rolar"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="12" cy="12" r="11" fill="#fff" />
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
