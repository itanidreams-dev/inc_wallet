import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Copy, ExternalLink, Loader2, LogOut, Send, ShieldCheck, Wallet } from 'lucide-react';
import network from '../metani-network.config.json';
import './style.css';

const SSO_TOKEN_KEY = 'itani_sso_token';
const SSO_USER_KEY = 'itani_sso_user';
const HUDLIFE_PORTAL = (import.meta.env.VITE_HUDLIFE_PORTAL_URL || 'https://hudlife.itaninetworkchain.com').replace(/\/+$/, '');
const HUDLIFE_SSO = (import.meta.env.VITE_HUDLIFE_SSO_URL || `${HUDLIFE_PORTAL}/api/sso`).replace(/\/+$/, '');
const CLIENT_ID = import.meta.env.VITE_ITANI_SSO_CLIENT_ID || 'inc-wallet-web';
const STAKING_ENDPOINT =
  import.meta.env.VITE_ITANI_STAKING_ENDPOINT ||
  'https://relay.itaninetworkchain.com/api/wallet/stake-tokens';
const activeNetwork = network.mainnet || network;
const nativeCurrency = activeNetwork.nativeCurrency || network.nativeCurrency;

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

function toHexWei(amount) {
  const [whole = '0', fraction = ''] = String(amount || '0').split('.');
  const paddedFraction = `${fraction}000000000000000000`.slice(0, 18);
  const wei = BigInt(whole || '0') * 10n ** 18n + BigInt(paddedFraction || '0');
  return `0x${wei.toString(16)}`;
}

function toWeiString(amount) {
  const [whole = '0', fraction = ''] = String(amount || '0').split('.');
  const paddedFraction = `${fraction}000000000000000000`.slice(0, 18);
  return (BigInt(whole || '0') * 10n ** 18n + BigInt(paddedFraction || '0')).toString();
}

async function ensureExternalWallet(address) {
  if (!window.ethereum) {
    throw new Error('Aucun wallet EVM detecte. Ouvre inc_wallet avec MetaMask, Trust Wallet ou un signer compatible.');
  }

  await window.ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: activeNetwork.chainIdHex,
      chainName: activeNetwork.chainName,
      nativeCurrency,
      rpcUrls: activeNetwork.rpcUrls,
      blockExplorerUrls: activeNetwork.blockExplorerUrls,
    }],
  });

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const account = accounts?.[0];
  if (!account) throw new Error('Aucun compte wallet autorise.');

  if (address && account.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Le wallet connecte ne correspond pas au wallet lie au Metani ID.');
  }

  return account;
}

function App() {
  const [user, setUser] = useState(() => readJson(SSO_USER_KEY));
  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState('pret');
  const [error, setError] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [stakeDuration, setStakeDuration] = useState(30);
  const [txHash, setTxHash] = useState('');

  const primaryRpc = useMemo(() => activeNetwork.rpcUrls[0], []);
  const primaryRest = useMemo(() => activeNetwork.restUrls[0], []);
  const walletAddress = user?.wallet_address || user?.address || '';
  const stakeRate = useMemo(() => {
    const amountScore = Math.min(Math.max(Number(stakeAmount || 0) / 10000, 0), 1);
    const durationScore = Math.min(Math.max(Number(stakeDuration || 1) / 365, 0), 1);
    return Math.min(100, Math.max(1, Math.round(1 + amountScore * 49 + durationScore * 50)));
  }, [stakeAmount, stakeDuration]);

  useEffect(() => {
    const incoming = getIncomingToken();
    const token = incoming || localStorage.getItem(SSO_TOKEN_KEY);
    if (!token) return;

    setStatus('verification');
    verifySso(token)
      .then((data) => {
        setUser(data.user);
        setBalance(data.balance_formatted || `${data.balance || '0'} ${nativeCurrency.symbol}`);
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

  async function copyAddress() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setStatus('adresse copiee');
  }

  async function sendItani(event) {
    event.preventDefault();
    setError('');
    setTxHash('');

    try {
      if (!recipient || !amount) throw new Error('Adresse destinataire et montant requis.');
      const from = await ensureExternalWallet(walletAddress);
      setStatus('signature');
      const hash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from,
          to: recipient,
          value: toHexWei(amount),
        }],
      });
      setTxHash(hash);
      setStatus('transaction envoyee');
    } catch (err) {
      setError(err.message || 'Transaction refusee ou invalide.');
      setStatus('pret');
    }
  }

  async function prepareStake() {
    setError('');
    if (!stakeAmount || Number(stakeAmount) <= 0) {
      setError('Montant staking requis.');
      return;
    }

    try {
      const from = await ensureExternalWallet(walletAddress);
      const token = localStorage.getItem(SSO_TOKEN_KEY);
      const amountWei = toWeiString(stakeAmount);
      const stakeAddress = walletAddress || from;
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [`stake_tokens:${stakeAddress}:${amountWei}`, from],
      });
      const data = await fetchJson(STAKING_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
          token,
          address: stakeAddress,
          amount: amountWei,
          duration_days: stakeDuration,
          annual_rate_percent: stakeRate,
          signature,
          asset: nativeCurrency.symbol,
        }),
      });
      if (data.success === false) {
        throw new Error(data.error || 'Staking refuse par le relay iTani.');
      }
      setTxHash(data.tx_hash || data.transactionHash || data.message || '');
      setStatus('staking envoye');
    } catch (err) {
      setError(err.message || 'Preparation staking impossible.');
    }
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
                <strong title={walletAddress}>{shorten(walletAddress)}</strong>
              </div>
              <div>
                <span>Solde</span>
                <strong>{balance || 'Synchronisation...'}</strong>
              </div>
              <div>
                <span>Chain ID</span>
                <strong>{activeNetwork.chainId}</strong>
              </div>
              <div>
                <span>RPC</span>
                <strong title={primaryRpc}>{primaryRpc.replace('https://', '')}</strong>
              </div>
            </div>
            <div className="actions">
              <button className="button secondary" type="button" onClick={copyAddress}>
                Recevoir <Copy size={16} />
              </button>
              <a className="button secondary" href={activeNetwork.blockExplorerUrls[0]} target="_blank" rel="noreferrer">
                Explorer <ExternalLink size={16} />
              </a>
              <a className="button secondary" href={activeNetwork.swapUrls?.[0] || 'https://hudlife.itaninetworkchain.com/swap'} target="_blank" rel="noreferrer">
                iTaniSwap <ExternalLink size={16} />
              </a>
              <button className="button ghost" type="button" onClick={logout}>
                Deconnecter <LogOut size={16} />
              </button>
            </div>
            <form className="operation" onSubmit={sendItani}>
              <h2>Envoyer {nativeCurrency.symbol}</h2>
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Adresse destinataire 0x..." />
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="Montant ITANI" />
              <button className="button" type="submit">
                Envoyer avec le wallet <Send size={16} />
              </button>
            </form>
            <div className="operation">
              <h2>Staking {nativeCurrency.symbol}</h2>
              <input value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value)} inputMode="decimal" placeholder="Montant a staker" />
              <label htmlFor="stake-duration">Duree: {stakeDuration} jours</label>
              <input id="stake-duration" type="range" min="1" max="365" value={stakeDuration} onChange={(event) => setStakeDuration(Number(event.target.value))} />
              <p className="rate">Taux estime: {stakeRate}%</p>
              <button className="button secondary" type="button" onClick={prepareStake}>
                Preparer staking
              </button>
            </div>
            {txHash ? <p className="success">Transaction: {txHash}</p> : null}
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
          <span>{activeNetwork.chainName}</span>
          <span>{primaryRest.replace('https://', '')}</span>
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
