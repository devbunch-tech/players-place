import {Form, Link} from 'react-router';
import type {Route} from './+types/canais';
import {productConfig} from '~/lib/commerce';

export async function loader({request, context}: Route.LoaderArgs) {
  return {
    videoAvailable: productConfig(context.env, 'video').available,
    canalAvailable: productConfig(context.env, 'canal').available,
    erro: new URL(request.url).searchParams.get('erro'),
  };
}

export const meta: Route.MetaFunction = () => [
  {title: 'Para canais de YouTube · Players Place'},
  {
    name: 'description',
    content:
      'Publique sua análise em vídeo na página do jogador: R$ 10 por vídeo ou R$ 100/mês por vídeos ilimitados.',
  },
];

const BENEFITS = [
  'Mais um canal de acesso aos seus vídeos — direto na página do jogador analisado',
  'Audiência qualificada: quem pesquisa o atleta é exatamente quem procura sua análise',
  'Link para o seu canal em cada vídeo — mais visualizações e novos inscritos',
  'Canais assinantes têm prioridade de exibição na página do jogador',
];

const MAILTO =
  'mailto:canais@playersplace.com.br?subject=Quero%20publicar%20v%C3%ADdeo-an%C3%A1lise';

export default function Canais({loaderData}: Route.ComponentProps) {
  const {videoAvailable, canalAvailable, erro} = loaderData;
  return (
    <div className="mx-auto max-w-3xl pp-in">
      <span className="inline-block rounded-md bg-lime px-2.5 py-1 text-[11px] font-extrabold tracking-widest text-ink">
        PARA YOUTUBERS
      </span>
      <h1 className="mt-4 font-display text-[32px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
        Sua análise, na página do{' '}
        <span className="rounded-md bg-lime px-1.5">jogador</span>.
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
        O Players Place é onde torcedores, olheiros e jornalistas pesquisam
        atletas. Publique seu vídeo de análise na página do jogador e ganhe
        mais um canal de acesso aos seus conteúdos — e mais crescimento para
        o seu canal no YouTube.
      </p>

      <ul className="mt-8 space-y-3 rounded-card border border-line bg-card p-5">
        {BENEFITS.map((b) => (
          <li key={b} className="flex items-start gap-3 text-sm font-semibold">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 13l5 5L20 6" stroke="#131711" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {b}
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col rounded-card border border-line bg-card p-5">
          <div className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
            Vídeo avulso
          </div>
          <div className="mt-1 font-display text-[40px] leading-none font-extrabold tracking-tight">
            R$ 10
            <span className="text-base font-bold text-faint">/vídeo</span>
          </div>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
            Um vídeo, um jogador. Ideal para testar o espaço com sua análise
            mais forte.
          </p>
          {videoAvailable ? (
            <Form method="post" action="/comprar" className="mt-4">
              <input type="hidden" name="produto" value="video" />
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center rounded-btn border border-line text-sm font-bold transition-colors hover:bg-hoverrow"
              >
                Publicar um vídeo
              </button>
            </Form>
          ) : (
            <a
              href={MAILTO}
              className="mt-4 flex h-11 items-center justify-center rounded-btn border border-line text-sm font-bold transition-colors hover:bg-hoverrow"
            >
              Publicar um vídeo
            </a>
          )}
        </div>

        <div className="flex flex-col rounded-card bg-pitch p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">
              Canal assinante
            </div>
            <span className="rounded-md bg-lime px-2 py-0.5 text-[9px] font-extrabold tracking-widest text-ink uppercase">
              Mais vantajoso
            </span>
          </div>
          <div className="mt-1 font-display text-[40px] leading-none font-extrabold tracking-tight">
            R$ 100
            <span className="text-base font-bold text-white/60">/mês</span>
          </div>
          <p className="mt-2 flex-1 text-[13px] leading-relaxed text-white/70">
            Vídeos ilimitados, de quantos jogadores quiser, com{' '}
            <strong className="text-white">prioridade de exibição</strong> nas
            páginas. Cancele quando quiser.
          </p>
          {canalAvailable ? (
            <Form method="post" action="/comprar" className="mt-4">
              <input type="hidden" name="produto" value="canal" />
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover"
              >
                Assinar como canal
              </button>
            </Form>
          ) : (
            <a
              href={MAILTO}
              className="mt-4 flex h-11 items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover"
            >
              Assinar como canal
            </a>
          )}

          {erro === 'carrinho' ? (
            <p className="mt-3 text-xs font-semibold text-white">
              Não foi possível abrir o checkout agora. Tente de novo em
              instantes.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-8 rounded-card border border-dashed border-addash bg-card p-5 text-[13px] leading-relaxed text-muted">
        <strong className="text-ink">Observações:</strong> a página do jogador
        exibe <strong className="text-ink">até 5 vídeos por padrão</strong>,
        priorizando os canais assinantes. Havendo mais análises, o botão{' '}
        <strong className="text-ink">“Ver mais análises”</strong> exibe as
        demais. No ambiente local os planos são demonstrativos; em produção, a
        cobrança (R$ 10 por vídeo ou R$ 100/mês) será processada pelo checkout
        da Shopify e o vídeo entra no ar após a confirmação do pagamento.
      </div>

      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold tracking-tight">
          Veja o espaço em ação
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          A página do{' '}
          <Link
            to="/jogadores/576026"
            className="font-semibold text-pitch underline-offset-2 hover:underline"
          >
            Santiago Sosa (Racing Club)
          </Link>{' '}
          já tem análises publicadas — é assim que seu vídeo vai aparecer.
        </p>
      </div>
    </div>
  );
}
