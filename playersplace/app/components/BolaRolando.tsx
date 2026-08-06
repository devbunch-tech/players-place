/**
 * Indicador global de navegação.
 *
 * ANTES: cobria a página inteira com um véu translúcido que também barrava o
 * clique, e ficava assim até a navegação terminar. Fazia sentido quando o
 * loader esperava TODO o conteúdo antes de renderizar — não havia página por
 * baixo do véu para o visitante usar.
 *
 * AGORA os loaders resolvem só o essencial (o topo, que sai da
 * `jogadores_base` em ~30 ms) e mandam cada painel pesado em streaming, com
 * esqueleto próprio. O véu passou a atrapalhar: escondia uma página que já
 * estava pronta e bloqueava cliques em links que já dava para usar.
 *
 * Então este componente virou duas coisas discretas:
 *
 *  1. uma barra fina no topo, que anda enquanto a navegação não fecha;
 *  2. depois de alguns segundos, um aviso no rodapé com a bola e uma
 *     curiosidade — para a espera longa não parecer travamento.
 *
 * Nenhum dos dois cobre conteúdo nem captura clique: quem espera continua
 * podendo navegar. O carregamento de cada área agora é problema da área,
 * resolvido pelos `<Suspense>` de cada rota.
 */
import {useEffect, useState} from 'react';
import {useNavigation} from 'react-router';
import {CURIOSIDADES, embaralhar, type Curiosidade} from '~/lib/curiosidades';

/**
 * Navegação instantânea não deve piscar nada. Com o streaming a maioria das
 * navegações fecha bem abaixo disto e o indicador nem chega a aparecer.
 */
const ATRASO_ATE_APARECER = 200;

/**
 * A curiosidade só entra quando a espera passa a incomodar. Antes disso ela
 * seria ruído: o visitante nem terminaria de ler antes da página trocar.
 */
const ATRASO_ATE_CURIOSIDADE = 2500;

/** tempo de leitura de cada frase antes de passar para a próxima */
const TROCA_CURIOSIDADE = 5000;

export function BolaRolando() {
  const navigation = useNavigation();
  const carregando = navigation.state !== 'idle';
  const [visivel, setVisivel] = useState(false);
  const [curiosidade, setCuriosidade] = useState<Curiosidade | null>(null);

  useEffect(() => {
    if (!carregando) {
      setVisivel(false);
      setCuriosidade(null);
      return;
    }

    const aparecer = setTimeout(() => setVisivel(true), ATRASO_ATE_APARECER);

    // Embaralha a cada navegação, e aqui dentro do efeito: `Math.random()` no
    // corpo do componente rodaria também no servidor e quebraria a hidratação.
    const fila = embaralhar(CURIOSIDADES);
    let i = 0;
    let rodizio: ReturnType<typeof setInterval> | undefined;

    const primeira = setTimeout(() => {
      setCuriosidade(fila[0] ?? null);
      rodizio = setInterval(() => {
        i = (i + 1) % fila.length;
        setCuriosidade(fila[i] ?? null);
      }, TROCA_CURIOSIDADE);
    }, ATRASO_ATE_CURIOSIDADE);

    return () => {
      clearTimeout(aparecer);
      clearTimeout(primeira);
      if (rodizio) clearInterval(rodizio);
    };
    // `navigation.location.key` além de `carregando`: reinicia a contagem a
    // cada nova navegação em vez de ficar presa na primeira
  }, [carregando, navigation.location?.key]);

  if (!visivel) return null;

  return (
    <>
      {/* `pointer-events-none` em tudo daqui para baixo é o ponto da mudança:
          o indicador informa, não interdita */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-transparent"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="pp-progresso h-full w-2/5 bg-pitch" />
        <span className="sr-only">Carregando página…</span>
      </div>

      {curiosidade ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          {/* `key` no texto: remonta o elemento a cada troca, e a animação de
              entrada roda de novo em vez de o texto trocar seco */}
          <div
            key={curiosidade.texto}
            className="pp-in flex max-w-md items-center gap-3 rounded-card border border-line bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur-sm"
          >
            <Bola />
            <p className="text-[13px] leading-snug text-muted">
              {curiosidade.texto}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Bola de futebol simplificada. O `circle` tem contorno próprio porque ela
 * fica sobre o cartão claro, e uma bola branca sem borda sumiria no fundo.
 */
function Bola() {
  return (
    <svg
      className="pp-rolar shrink-0"
      width="26"
      height="26"
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
