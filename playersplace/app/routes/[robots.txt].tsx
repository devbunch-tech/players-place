export function loader() {
  // protótipo local — não indexar
  return new Response('User-agent: *\nDisallow: /\n', {
    status: 200,
    headers: {'Content-Type': 'text/plain'},
  });
}
