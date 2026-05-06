import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ExternalLink, Loader2, LogOut, ShieldCheck, Wallet } from 'lucide-react';
import network from '../metani-network.config.json';
import './style.css';

const SSO_TOKEN_KEY = 'itani_sso_token';
const SSO_USER_KEY = 'itani_sso_user';
const HUDLIFE_PORTAL = (import.meta.env.VITE_HUDLIFE_PORTAL_URL || 'https://hudlife.itaninetworkchain.com').replace(/\/+$/, '');
const HUDLIFE_SSO = (import.meta.env.VITE_HUDLIFE_SSO_URL || `${HUDLIFE_PORTAL}/api/sso`).replace(/\/+$/, '');
const CLIENT_ID = import.meta.env.VITE_ITANI_SSO_CLIENT_ID || 'inc-wallet-web';

function shorten(value) {
  if (!value) return 'Non lie';
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function getIncomingToken() {
  const url = new URL(window.location.href);
  return url.searchParams.get('sso_token') || url.searchParams.get('token');
}

function cleanUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('sso_token');
  url.searchParams.delete('token');
  url.searchParams.delete('pseudo');
  url.searchParams.delete('address');
  history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

function getLoginUrl() {
  const url = new URL(`${HUDLIFE_PORTAL}/login`);
  url.searchParams.set('app', 'inc_wallet');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', `${window.location.origin}${window.location.pathname}`);
  url.searchParams.set('mode', 'login');
  url.searchParams.set('provider', 'hudlife');
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function verifySso(token) {
  const params = new URLSearchParams({ token, app: 'inc_wallet' });
  const data = await fetchJson(`${HUDLIFE_SSO}/verify?${params.toString()}`);
  if (!data.valid || !data.user) throw new Error(data.error || 'Session HudLife invalide');
  localStorage.setItem(SSO_TOKEN_KEY, token);
  localStorage.setItem(SSO_USER_KEY, JSON.stringify(data.user));
  return data;
}

function App() {
  const [user, setUser] = useState(() => readJson(SSO_USER_KEY));
  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState('pret');
  const [error, setError] = useState('');

  const primaryRpc = useMemo(() => network.rpcUrls[0], []);
  const primaryRest = useMemo(() => network.restUrls[0], []);

  useEffect(() => {
    const incoming = getIncomingToken();
    const token = incoming || localStorage.getItem(SSO_TOKEN_KEY);
    if (!token) return;

    setStatus('verification');
    verifySso(token)
      .then((data) => {
        setUser(data.user);
        setBalance(data.balance_formatted || `${data.balance || '0'} ${network.nativeCurrency.symbol}`);
      })
      .catch((err) => {
        setError(err.message);
        localStorage.removeItem(SSO_TOKEN_KEY);
        localStorage.removeItem(SSO_USER_KEY);
      })
      .finally(() => {
        cleanUrl();
        setStatus('pret');
      });
  }, []);

  function logout() {
    localStorage.removeItem(SSO_TOKEN_KEY);
    localStorage.removeItem(SSO_USER_KEY);
    setUser(null);
    setBalance(null);
  }

  return (
    <main className="shell">
      <section className="panel">
        <div className="brand">
          <span className="brandMark"><Wallet size={24} /></span>
          <div>
            <p>inc_wallet</p>
            <h1>Wallet iTani lie au Metani ID</h1>
          </div>
        </div>

        {user ? (
          <div className="stack">
            <div className="account">
              <ShieldCheck size={24} />
              <div>
                <span>Compte central</span>
                <strong>{user.display_name || user.username || user.pseudo}</strong>
              </div>
            </div>
            <div className="grid">
              <div>
                <span>Wallet</span>
                <strong title={user.wallet_address || user.address}>{shorten(user.wallet_address || user.address)}</strong>
              </div>
              <div>
                <span>Solde</span>
                <strong>{balance || 'Synchronisation...'}</strong>
              </div>
              <div>
                <span>Chain ID</span>
                <strong>{network.chainId}</strong>
              </div>
              <div>
                <span>RPC</span>
                <strong title={primaryRpc}>{primaryRpc.replace('https://', '')}</strong>
              </div>
            </div>
            <div className="actions">
              <a className="button secondary" href={network.blockExplorerUrls[0]} target="_blank" rel="noreferrer">
                Explorer <ExternalLink size={16} />
              </a>
              <button className="button ghost" type="button" onClick={logout}>
                Deconnecter <LogOut size={16} />
              </button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <p className="copy">
              Connecte-toi avec HudLife. Le meme compte et le meme wallet seront utilises dans ArtLinks, HudWorld,
              HudLife et inc_wallet.
            </p>
            {error ? <p className="error">{error}</p> : null}
            <a className="button" href={getLoginUrl()}>
              {status === 'verification' ? <Loader2 className="spin" size={18} /> : null}
              Continuer avec Metani ID <ArrowRight size={18} />
            </a>
          </div>
        )}

        <footer>
          <span>{network.chainName}</span>
          <span>{primaryRest.replace('https://', '')}</span>
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
