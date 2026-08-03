/**
 * Escolha do apelido — primeira parada de quem entra no Game Fantasy.
 *
 * O apelido é o que aparece no ranking público, então passa por validação de
 * formato e por filtro de conteúdo antes de ser gravado (ver lib/apelido.ts).
 */
import {Form, Link, redirect} from 'react-router';
import type {Route} from './+types/fantasy_.apelido';
import {getCustomerId} from '~/lib/pro';
import {createDb} from '~/lib/db';
import {buscarPerfil, salvarApelido} from '~/lib/fantasy.server';
import {MAX_LEN, MIN_LEN, validarApelido} from '~/lib/apelido';
import {canonical, seo} from '~/lib/seo';

// área logada: nada aqui deve entrar no índice
export const meta: Route.MetaFunction = () =>
  seo({
    title: 'Seu apelido · Game Fantasy',
    description: 'Escolha o apelido que aparece no ranking público do game.',
    url: canonical('/fantasy/apelido'),
    noindex: true,
  });

export async function loader({context}: Route.LoaderArgs) {
  const cliente = await getCustomerId(context);
  if (!cliente) return redirect('/account/login');

  const db = createDb(context.env);
  if (!db) throw new Response('Game Fantasy indisponível.', {status: 503});

  const perfil = await buscarPerfil(db, cliente.id);
  return {atual: perfil?.nickname ?? '', primeiroNome: cliente.firstName};
}

export async function action({request, context}: Route.ActionArgs) {
  const cliente = await getCustomerId(context);
  if (!cliente) return redirect('/account/login');

  const db = createDb(context.env);
  if (!db) return {erro: 'Banco indisponível.'};

  const bruto = String((await request.formData()).get('apelido') ?? '');
  const check = validarApelido(bruto);
  if (!check.ok) return {erro: check.erro};

  const r = await salvarApelido(db, cliente.id, check.apelido, check.normalizado);
  if (!r.ok) return {erro: r.erro};

  return redirect('/fantasy/perfil');
}

export default function Apelido({loaderData, actionData}: Route.ComponentProps) {
  const {atual, primeiroNome} = loaderData;

  return (
    <div className="mx-auto max-w-md pp-in">
      <Link to="/fantasy" className="text-[13px] font-semibold text-pitch hover:underline">
        ← Game Fantasy
      </Link>

      <h1 className="mt-3 font-display text-[26px] font-extrabold tracking-tight">
        {atual ? 'Alterar apelido' : `Bem-vindo${primeiroNome ? `, ${primeiroNome}` : ''}!`}
      </h1>
      <p className="mt-2 text-sm text-muted">
        Escolha como seu nome aparece no ranking. Ele é público — pense em algo
        que você mostraria na live do canal.
      </p>

      <Form method="post" className="mt-6">
        <label htmlFor="apelido" className="sr-only">
          Apelido
        </label>
        <input
          id="apelido"
          name="apelido"
          defaultValue={atual}
          required
          minLength={MIN_LEN}
          maxLength={MAX_LEN}
          autoComplete="off"
          placeholder="Seu apelido no ranking"
          className="h-12 w-full rounded-btn border border-line bg-card px-4 text-[15px] outline-none placeholder:text-faint focus:border-pitch"
        />
        <p className="mt-2 text-xs text-faint">
          De {MIN_LEN} a {MAX_LEN} caracteres. Letras, números, espaço, ponto,
          hífen e underscore.
        </p>

        {actionData?.erro ? (
          <p className="mt-3 rounded-btn border border-down/40 bg-down/10 p-3 text-sm font-semibold text-down">
            {actionData.erro}
          </p>
        ) : null}

        <button
          type="submit"
          className="mt-5 flex h-12 w-full items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover"
        >
          {atual ? 'Salvar apelido' : 'Continuar'}
        </button>
      </Form>
    </div>
  );
}
