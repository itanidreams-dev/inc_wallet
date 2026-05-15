const DEFAULT_ORIGIN = 'https://inc-wallet.fly.dev';

export default {
  async fetch(request, env) {
    const origin = (env.ITANI_APP_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
    const incomingUrl = new URL(request.url);
    const originUrl = new URL(origin);
    const upstreamUrl = new URL(request.url);

    upstreamUrl.protocol = originUrl.protocol;
    upstreamUrl.hostname = originUrl.hostname;
    upstreamUrl.port = originUrl.port;

    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', incomingUrl.host);
    headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

    return fetch(new Request(upstreamUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: request.redirect,
    }));
  },
};
