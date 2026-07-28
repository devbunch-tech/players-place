import {Link, useRouteLoaderData} from 'react-router';

/** Card de assinatura PRO (verde-campo com CTA lima) */
export function ProCard() {
  const data = useRouteLoaderData('root') as {pro?: boolean} | undefined;
  const pro = data?.pro ?? false;
  return (
    <div className="rounded-card bg-pitch p-5 text-white">
      <span className="inline-block rounded-md bg-lime px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-ink">
        PRO
      </span>
      <h3 className="mt-3 font-display text-[19px] leading-snug font-extrabold tracking-tight">
        {pro ? 'Você navega sem anúncios' : 'Consulte tudo sem anúncios'}
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">
        {pro
          ? 'Assinatura PRO ativa nesta sessão. Obrigado por apoiar a plataforma!'
          : 'Assine o Players Place PRO por R$ 5/mês e pesquise jogadores, clubes e ligas sem nenhuma publicidade.'}
      </p>
      <Link
        to="/pro"
        className="mt-4 flex h-11 items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover"
      >
        {pro ? 'Gerenciar assinatura' : 'Assinar por R$ 5/mês'}
      </Link>
    </div>
  );
}
