import {useRouteLoaderData} from 'react-router';

/**
 * Espaço de publicidade (anúncio nativo, card com borda tracejada).
 * Oculto automaticamente quando o visitante tem o plano PRO ativo
 * (cookie lido no loader do root). Em produção, este componente
 * será alimentado pelos anúncios vendidos via Shopify.
 */
export function AdSlot({compact = false}: {compact?: boolean}) {
  const data = useRouteLoaderData('root') as {pro?: boolean} | undefined;
  if (data?.pro) return null;
  return (
    <div className="rounded-card border border-dashed border-addash bg-card p-4">
      <div className="text-[8.5px] font-bold tracking-[0.18em] text-faint uppercase">
        Publicidade
      </div>
      <div className={`flex items-center gap-3 ${compact ? 'mt-2' : 'mt-3'}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-soft text-lg">
          📣
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold">Anuncie no Players Place</div>
          <div className="text-xs text-muted">
            Sua marca para quem vive o mercado da bola.{' '}
            <a
              href="mailto:anuncie@playersplace.com.br"
              className="font-semibold text-pitch underline-offset-2 hover:underline"
            >
              Quero anunciar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
