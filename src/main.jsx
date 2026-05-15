import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Blocks,
  ChevronRight,
  Coins,
  Copy,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  History,
  Image,
  Layers,
  Loader2,
  LockKeyhole,
  LogOut,
  Network,
  RefreshCw,
  Repeat2,
  Bitcoin,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import network from '../metani-network.config.json';
import './style.css';

const SSO_TOKEN_KEY = 'itani_sso_token';
const SSO_USER_KEY = 'itani_sso_user';
const ACTIVITY_KEY = 'inc_wallet_activity';
const HUDLIFE_PORTAL = (import.meta.env.VITE_HUDLIFE_PORTAL_URL || 'https://hudlife.itaninetworkchain.com').replace(/\/+$/, '');
const HUDLIFE_SSO = (import.meta.env.VITE_HUDLIFE_SSO_URL || `${HUDLIFE_PORTAL}/api/sso`).replace(/\/+$/, '');
const CLIENT_ID = import.meta.env.VITE_ITANI_SSO_CLIENT_ID || 'inc-wallet-web';
const STAKING_ENDPOINT =
  import.meta.env.VITE_ITANI_STAKING_ENDPOINT ||
  'https://relay.itaninetworkchain.com/api/wallet/stake-tokens';
const activeNetwork = network.mainnet || network;
const nativeCurrency = activeNetwork.nativeCurrency || network.nativeCurrency;
const JSON_RPC_ENDPOINT = activeNetwork?.rpcUrls?.[0] || 'https://relay.itaninetworkchain.com/jsonrpc';
const NFT_BOX_ENDPOINT = import.meta.env.VITE_NFT_BOX_ENDPOINT || '/nft-marketplace.json';
const ITANI_PER_BTC = Number(import.meta.env.VITE_ITANI_BTC_RATE || 10000);
const SATOSHIS_PER_BTC = 100000000;
const BRIDGE_READ_ONLY = true;

const tabs = [
  { id: 'home', label: 'Dashboard', icon: BarChart3 },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'send', label: 'Envoyer', icon: ArrowUpRight },
  { id: 'receive', label: 'Recevoir', icon: ArrowDownLeft },
  { id: 'stake', label: 'Staking', icon: Sparkles },
  { id: 'tokens', label: 'Tokens', icon: Coins },
  { id: 'nfts', label: 'NFTs', icon: Image },
  { id: 'explorer', label: 'Explorer', icon: Blocks },
  { id: 'bridge', label: 'Bridge', icon: Repeat2 },
  { id: 'activity', label: 'Activité', icon: History },
];

function shorten(value, left = 8, right = 6) {
  if (!value) return 'Non lié';
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function readJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function writeActivity(entry) {
  const items = readJson(ACTIVITY_KEY, []);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify([{ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...entry }, ...items].slice(0, 30)));
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

function getAuthUrl(mode = 'login') {
  const url = new URL(`${HUDLIFE_PORTAL}/login`);
  url.searchParams.set('app', 'inc_wallet');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', `${window.location.origin}${window.location.pathname}`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('provider', 'hudlife');
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    credentials: 'include',
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function jsonRpc(method, params = {}) {
  const data = await fetchJson(JSON_RPC_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
  });
  if (data.error) throw new Error(data.error.message || 'Erreur JSON-RPC iTani');
  return data.result;
}

async function verifySso(token) {
  const params = new URLSearchParams({ app: 'inc_wallet' });
  if (token) {
    params.set('token', token);
  }
  const data = await fetchJson(`${HUDLIFE_SSO}/verify?${params.toString()}`);
  if (!data.valid || !data.user) throw new Error(data.error || 'Session HudLife invalide');
  if (token) {
    localStorage.setItem(SSO_TOKEN_KEY, token);
  }
  localStorage.setItem(SSO_USER_KEY, JSON.stringify(data.user));
  return data;
}

function toHexWei(amount) {
  const [whole = '0', fraction = ''] = String(amount || '0').split('.');
  const wei = BigInt(whole || '0') * 10n ** 18n + BigInt(`${fraction}000000000000000000`.slice(0, 18) || '0');
  return `0x${wei.toString(16)}`;
}

function toWeiString(amount) {
  const [whole = '0', fraction = ''] = String(amount || '0').split('.');
  return (BigInt(whole || '0') * 10n ** 18n + BigInt(`${fraction}000000000000000000`.slice(0, 18) || '0')).toString();
}

function itaniToBtc(amount) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / ITANI_PER_BTC;
}

function btcToSatoshis(btcAmount) {
  return Math.floor(Number(btcAmount || 0) * SATOSHIS_PER_BTC);
}

async function ensureExternalWallet(expectedAddress) {
  if (!window.ethereum) {
    throw new Error('Aucun signer EVM détecté. Ouvre inc_wallet avec MetaMask, Trust Wallet ou un navigateur wallet.');
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
  if (!account) throw new Error('Aucun compte wallet autorisé.');

  if (expectedAddress?.startsWith?.('0x') && account.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error('Le signer externe ne correspond pas au wallet lié au Metani ID.');
  }

  return account;
}

function parseBalanceText(value) {
  if (!value) return '0';
  return String(value).replace(/\s*ITANI\s*$/i, '').trim();
}

function formatUnits(value, decimals = 18, maxFraction = 4) {
  if (value === undefined || value === null || value === '') return '0';
  try {
    const raw = BigInt(String(value));
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const fraction = raw % base;
    const fractionText = fraction.toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
    return fractionText ? `${whole}.${fractionText}` : whole.toString();
  } catch {
    return String(value);
  }
}

function compactNumber(value) {
  const n = Number(String(value || 0).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n)) return String(value || '0');
  return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

function pickResult(value, fallback = null) {
  return value && typeof value === 'object' ? value : fallback;
}

function AuthScreen({ error, status, onEmailAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    pseudo: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitEmailAuth(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await onEmailAuth(mode, form);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <div className="authVisual">
          <div className="orbital">
            <span><Wallet size={40} /></span>
          </div>
          <p className="eyebrow">iTani Network Chain</p>
          <h1>iTani Chain App</h1>
          <p>
            Wallet officiel, portfolio, explorer, tokens, NFTs, staking et données de valeur ITANI dans une interface simple et mobile-first.
          </p>
          <div className="trustList">
            <span><ShieldCheck size={16} /> SSO HudLife</span>
            <span><LockKeyhole size={16} /> Signer externe</span>
            <span><Network size={16} /> Chain ID 1229800785</span>
          </div>
        </div>

        <div className="authPanel">
          <div className="walletLogo">
            <span><Wallet size={22} /></span>
            <div>
              <strong>iTani Chain App</strong>
              <small>Official wallet</small>
            </div>
          </div>
          <h2>Commencer</h2>
          <p>Crée ou connecte ton compte Metani avec email et mot de passe. Aucun email de récupération n’est requis pour commencer.</p>
          {error ? <div className="alert error">{error}</div> : null}
          <div className="authModeSwitch" role="tablist" aria-label="Mode de connexion">
            <button className={!isRegister ? 'active' : ''} type="button" onClick={() => setMode('login')}>Connexion</button>
            <button className={isRegister ? 'active' : ''} type="button" onClick={() => setMode('register')}>Créer compte</button>
          </div>
          <form className="emailAuthForm" onSubmit={submitEmailAuth}>
            {isRegister ? (
              <div className="authFieldsGrid">
                <label>
                  Prénom
                  <input value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} autoComplete="given-name" required />
                </label>
                <label>
                  Nom
                  <input value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} autoComplete="family-name" required />
                </label>
              </div>
            ) : null}
            {isRegister ? (
              <label>
                Pseudo optionnel
                <input value={form.pseudo} onChange={(event) => updateField('pseudo', event.target.value)} autoComplete="nickname" />
              </label>
            ) : null}
            <label>
              Adresse email
              <input value={form.email} onChange={(event) => updateField('email', event.target.value)} type="email" autoComplete="email" required />
            </label>
            <label>
              Mot de passe
              <input value={form.password} onChange={(event) => updateField('password', event.target.value)} type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} required />
            </label>
            {isRegister ? (
              <label>
                Confirmer le mot de passe
                <input value={form.confirmPassword} onChange={(event) => updateField('confirmPassword', event.target.value)} type="password" autoComplete="new-password" minLength={8} required />
              </label>
            ) : null}
            <button className="primaryAction" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} />}
              {isRegister ? 'Créer mon compte' : 'Me connecter'}
            </button>
          </form>
          <div className="ssoFallback">
            <a className="secondaryAction" href={getAuthUrl('register')}>Créer via HudLife</a>
            <a className="secondaryAction" href={getAuthUrl('login')}>Connexion HudLife</a>
          </div>
          <div className="statusLine">
            {status === 'verification' ? <Loader2 className="spin" size={16} /> : <BadgeCheck size={16} />}
            <span>{status === 'verification' ? 'Vérification SSO...' : 'Réseau iTani prêt'}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function App() {
  const [user, setUser] = useState(() => readJson(SSO_USER_KEY));
  const [balance, setBalance] = useState(null);
  const [status, setStatus] = useState('prêt');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [stakeAmount, setStakeAmount] = useState('');
  const [stakeDuration, setStakeDuration] = useState(30);
  const [btcItaniAmount, setBtcItaniAmount] = useState('10000');
  const [btcDestination, setBtcDestination] = useState('');
  const [txHash, setTxHash] = useState('');
  const [showBalance, setShowBalance] = useState(true);
  const [externalAccount, setExternalAccount] = useState('');
  const [activity, setActivity] = useState(() => readJson(ACTIVITY_KEY, []));
  const [chainInfo, setChainInfo] = useState(null);
  const [priceInfo, setPriceInfo] = useState(null);
  const [dynamicInfo, setDynamicInfo] = useState(null);
  const [stakingInfo, setStakingInfo] = useState(null);
  const [tokensInfo, setTokensInfo] = useState(null);
  const [nftCollections, setNftCollections] = useState(null);
  const [nftMarketplace, setNftMarketplace] = useState(null);
  const [nftBox, setNftBox] = useState(null);
  const [walletInfo, setWalletInfo] = useState(null);
  const [addressHistory, setAddressHistory] = useState(null);
  const [walletNfts, setWalletNfts] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);

  const walletAddress = user?.wallet_address || user?.address || '';
  const displayName = user?.display_name || user?.username || user?.pseudo || 'Compte Metani';
  const balanceValue = parseBalanceText(balance);
  const btcQuote = useMemo(() => itaniToBtc(btcItaniAmount), [btcItaniAmount]);
  const btcSatoshis = useMemo(() => btcToSatoshis(btcQuote), [btcQuote]);
  const collectionItems = nftCollections?.collections?.length ? nftCollections.collections : (nftBox?.collections || []);
  const marketplaceItems = nftMarketplace?.listings?.length ? nftMarketplace.listings : (nftBox?.listings || []);
  const stakeRate = useMemo(() => {
    const amountScore = Math.min(Math.max(Number(stakeAmount || 0) / 10000, 0), 1);
    const durationScore = Math.min(Math.max(Number(stakeDuration || 1) / 365, 0), 1);
    return Math.min(100, Math.max(1, Math.round(1 + amountScore * 49 + durationScore * 50)));
  }, [stakeAmount, stakeDuration]);

  async function refreshChainData() {
    const [chain, price, dynamic, staking, tokens, collections, marketplace, nftBoxSeed] = await Promise.allSettled([
      jsonRpc('get_chain_info'),
      jsonRpc('oracle_get_price'),
      jsonRpc('get_dynamic_rate'),
      jsonRpc('get_staking_info'),
      jsonRpc('get_deployed_tokens'),
      jsonRpc('nft_collections'),
      jsonRpc('nft_marketplace'),
      fetchJson(NFT_BOX_ENDPOINT),
    ]);
    if (chain.status === 'fulfilled') setChainInfo(pickResult(chain.value));
    if (price.status === 'fulfilled') setPriceInfo(pickResult(price.value));
    if (dynamic.status === 'fulfilled') setDynamicInfo(pickResult(dynamic.value));
    if (staking.status === 'fulfilled') setStakingInfo(pickResult(staking.value));
    if (tokens.status === 'fulfilled') setTokensInfo(pickResult(tokens.value));
    if (collections.status === 'fulfilled') setNftCollections(pickResult(collections.value));
    if (marketplace.status === 'fulfilled') setNftMarketplace(pickResult(marketplace.value));
    if (nftBoxSeed.status === 'fulfilled') setNftBox(pickResult(nftBoxSeed.value));
  }

  async function refreshWalletData(address = walletAddress) {
    if (!address) return;
    const [info, history, nfts] = await Promise.allSettled([
      jsonRpc('get_wallet_info', { address }),
      jsonRpc('get_address_history', { address, limit: 25 }),
      jsonRpc('nft_tokens_by_owner', { owner: address, address }),
    ]);
    if (info.status === 'fulfilled') setWalletInfo(pickResult(info.value));
    if (history.status === 'fulfilled') setAddressHistory(pickResult(history.value));
    if (nfts.status === 'fulfilled') setWalletNfts(pickResult(nfts.value));
  }

  async function applyAuthSession(data, source = 'email') {
    const token = data.sso_token || data.token || data.session_token;
    const account = data.user || data.profile || null;
    if (!token) throw new Error('Le serveur n’a pas retourné de session valide.');
    if (!account) throw new Error('Le serveur n’a pas retourné de compte utilisateur.');

    localStorage.setItem(SSO_TOKEN_KEY, token);
    localStorage.setItem(SSO_USER_KEY, JSON.stringify(account));
    setUser(account);
    setBalance(data.balance_formatted || `${data.balance || '0'} ${nativeCurrency.symbol}`);
    await Promise.allSettled([
      refreshChainData(),
      refreshWalletData(account.wallet_address || account.address),
    ]);
    writeActivity({
      type: source,
      title: source === 'register' ? 'Compte Metani créé' : 'Compte Metani connecté',
      detail: account.pseudo || account.email || account.wallet_address || account.address || 'Email/password',
    });
    setActivity(readJson(ACTIVITY_KEY, []));
  }

  async function handleEmailAuth(mode, form) {
    const email = form.email.trim().toLowerCase();
    const password = form.password;
    if (!email || !password) throw new Error('Email et mot de passe requis.');
    if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
    if (mode === 'register' && password !== form.confirmPassword) {
      throw new Error('Les deux mots de passe ne correspondent pas.');
    }

    setError('');
    setStatus(mode === 'register' ? 'création compte' : 'connexion email');
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload = mode === 'register'
        ? {
            app: 'inc_wallet',
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
            pseudo: form.pseudo.trim() || undefined,
            email,
            password,
          }
        : {
            app: 'inc_wallet',
            email,
            identifier: email,
            password,
          };
      const data = await fetchJson(`${HUDLIFE_PORTAL}${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await applyAuthSession(data, mode);
      setStatus('prêt');
    } catch (err) {
      setError(err.message || 'Connexion impossible.');
      setStatus('prêt');
      throw err;
    }
  }

  useEffect(() => {
    const incoming = getIncomingToken();
    const token = incoming || localStorage.getItem(SSO_TOKEN_KEY);

    refreshChainData().catch(() => {});
    setStatus('verification');
    verifySso(token)
      .then((data) => {
        setUser(data.user);
        setBalance(data.balance_formatted || `${data.balance || '0'} ${nativeCurrency.symbol}`);
        refreshWalletData(data.user?.wallet_address || data.user?.address).catch(() => {});
        writeActivity({ type: 'sso', title: 'Session Metani connectée', detail: data.user?.pseudo || data.user?.address || 'SSO HudLife' });
        setActivity(readJson(ACTIVITY_KEY, []));
      })
      .catch((err) => {
        setError(err.message);
        localStorage.removeItem(SSO_TOKEN_KEY);
        localStorage.removeItem(SSO_USER_KEY);
      })
      .finally(() => {
        cleanUrl();
        setStatus('prêt');
      });
  }, []);

  async function refreshSession() {
    const token = localStorage.getItem(SSO_TOKEN_KEY);
    if (!token) return;
    setStatus('sync');
    try {
      const data = await verifySso(token);
      setUser(data.user);
      setBalance(data.balance_formatted || `${data.balance || '0'} ${nativeCurrency.symbol}`);
      await Promise.allSettled([
        refreshChainData(),
        refreshWalletData(data.user?.wallet_address || data.user?.address),
      ]);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus('prêt');
    }
  }

  async function searchChain(event) {
    event.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchResult({ loading: true });
    try {
      let result;
      if (/^\d+$/.test(q)) {
        result = await jsonRpc('get_block', { height: Number(q), block_height: Number(q) });
      } else if (q.startsWith('iTx') || q.startsWith('0x')) {
        result = await jsonRpc('get_transaction_details', { tx_id: q, hash: q });
      } else {
        result = await jsonRpc('get_wallet_info', { address: q });
      }
      setSearchResult({ query: q, result });
    } catch (err) {
      setSearchResult({ query: q, error: err.message });
    }
  }

  function logout() {
    localStorage.removeItem(SSO_TOKEN_KEY);
    localStorage.removeItem(SSO_USER_KEY);
    setUser(null);
    setBalance(null);
  }

  async function copyAddress() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setStatus('adresse copiée');
  }

  async function connectSigner() {
    try {
      const account = await ensureExternalWallet(walletAddress);
      setExternalAccount(account);
      setError('');
      writeActivity({ type: 'signer', title: 'Signer externe connecté', detail: shorten(account) });
      setActivity(readJson(ACTIVITY_KEY, []));
    } catch (err) {
      setError(err.message);
    }
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
        params: [{ from, to: recipient, value: toHexWei(amount) }],
      });
      setTxHash(hash);
      setStatus('transaction envoyée');
      writeActivity({ type: 'send', title: `Envoi ${amount} ITANI`, detail: hash });
      setActivity(readJson(ACTIVITY_KEY, []));
    } catch (err) {
      setError(err.message || 'Transaction refusée ou invalide.');
      setStatus('prêt');
    }
  }

  async function stakeItani() {
    setError('');
    setTxHash('');
    if (!stakeAmount || Number(stakeAmount) <= 0) {
      setError('Montant staking requis.');
      return;
    }

    try {
      const from = await ensureExternalWallet(walletAddress);
      const token = localStorage.getItem(SSO_TOKEN_KEY);
      const amountWei = toWeiString(stakeAmount);
      const stakeAddress = walletAddress || from;
      setStatus('signature staking');
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [`stake_tokens:${stakeAddress}:${amountWei}`, from],
      });
      setStatus('envoi relay');
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
      if (data.success === false) throw new Error(data.error || 'Staking refusé par le relay iTani.');
      const result = data.tx_hash || data.transactionHash || data.message || 'Staking envoyé';
      setTxHash(result);
      setStatus('staking envoyé');
      writeActivity({ type: 'stake', title: `Staking ${stakeAmount} ITANI`, detail: result });
      setActivity(readJson(ACTIVITY_KEY, []));
    } catch (err) {
      setError(err.message || 'Staking impossible.');
      setStatus('prêt');
    }
  }

  async function buyBtcWithItani(event) {
    event.preventDefault();
    setError('');
    setTxHash('');

    if (!btcItaniAmount || Number(btcItaniAmount) <= 0) {
      setError('Montant ITANI requis pour acheter du BTC.');
      return;
    }

    try {
      const from = await ensureExternalWallet(walletAddress);
      const amountWei = toWeiString(btcItaniAmount);
      const address = walletAddress || from;
      setStatus('signature achat BTC');
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [`buy_btc:${address}:${amountWei}:${btcSatoshis}`, from],
      });

      setStatus('swap ITANI vers ITABTC');
      const swap = await jsonRpc('swap_iTani_for_itabtc', {
        address,
        amount_iTani: amountWei,
        signature,
        fixed_rate: {
          itani_per_btc: ITANI_PER_BTC,
          btc_out: btcQuote.toFixed(8),
          satoshis: String(btcSatoshis),
        },
      });

      let detail = swap?.itabtc_out_btc
        ? `Achat confirmé: ${swap.itabtc_out_btc} ITABTC`
        : `Achat demandé: ${btcQuote.toFixed(8)} BTC`;

      if (btcDestination.trim()) {
        setStatus('demande retrait BTC');
        const withdrawalSignature = await window.ethereum.request({
          method: 'personal_sign',
          params: [`btc_withdrawal:${btcDestination.trim()}:${btcSatoshis}:${address}`, from],
        });
        const withdrawal = await jsonRpc('request_btc_withdrawal', {
          iTani_address: address,
          satoshis: String(btcSatoshis),
          btc_destination: btcDestination.trim(),
          signature: withdrawalSignature,
        });
        detail = withdrawal?.tx_id || withdrawal?.status || detail;
      }

      setTxHash(detail);
      setStatus('achat BTC envoyé');
      writeActivity({ type: 'btc', title: `Achat BTC ${btcItaniAmount} ITANI`, detail });
      setActivity(readJson(ACTIVITY_KEY, []));
    } catch (err) {
      setError(err.message || 'Achat BTC impossible.');
      setStatus('prêt');
    }
  }

  if (!user) return <AuthScreen error={error} status={status} onEmailAuth={handleEmailAuth} />;

  const tab = tabs.find((item) => item.id === activeTab) || tabs[0];

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="walletLogo">
            <span><Wallet size={22} /></span>
            <div>
            <strong>iTani Chain App</strong>
            <small>Official dApp</small>
          </div>
        </div>
        <nav className="navList" aria-label="Navigation wallet">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeTab === item.id ? 'active' : ''} type="button" onClick={() => setActiveTab(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="logoutButton" type="button" onClick={logout}>
          <LogOut size={17} /> Déconnecter
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{tab.label}</p>
            <h1>{displayName}</h1>
          </div>
          <div className="topActions">
            <button className="iconButton" type="button" onClick={refreshSession} title="Rafraîchir">
              {status === 'sync' ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            </button>
            <button className="networkPill" type="button" onClick={() => setActiveTab('explorer')}>
              <span />
              {activeNetwork.chainName}
            </button>
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}
        {txHash ? <div className="alert success">{txHash}</div> : null}

        {activeTab === 'home' ? (
          <div className="dashboardGrid">
            <section className="card heroCard wide">
              <div>
                <p className="eyebrow">dApp officielle</p>
                <h2>Wallet + Explorer + Portfolio + Tokens/NFTs</h2>
                <p>Cette app lit directement la blockchain iTani Network Chain. Les opérations sensibles restent signées par un wallet externe.</p>
              </div>
              <button className="primaryAction compact" type="button" onClick={refreshSession}>
                Synchroniser <RefreshCw size={18} />
              </button>
            </section>

            <StatCard label="Prix spot ITANI" value={priceInfo?.spot_price_eur || chainInfo?.amm?.current_price_eur || '-'} icon={Gauge} />
            <StatCard label="TWAP INPO" value={priceInfo?.twap_eur || chainInfo?.amm?.oracle?.twap_100_nano_eur || '-'} icon={BarChart3} />
            <StatCard label="Market cap estimée" value={chainInfo?.amm?.estimated_market_cap_eur || dynamicInfo?.amm_pool?.market_cap_eur || '-'} icon={Coins} />
            <StatCard label="Transactions" value={String(chainInfo?.total_transactions ?? '-')} icon={History} />

            <section className="balanceCard">
              <div className="balanceHeader">
                <span>Solde total</span>
                <button className="iconButton subtle" type="button" onClick={() => setShowBalance(!showBalance)}>
                  {showBalance ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <strong>{showBalance ? balanceValue : '••••••'} <small>{nativeCurrency.symbol}</small></strong>
              <p>{shorten(walletAddress, 12, 10)}</p>
              <div className="quickActions">
                <button type="button" onClick={() => setActiveTab('send')}><Send size={18} /> Envoyer</button>
                <button type="button" onClick={() => setActiveTab('receive')}><ArrowDownLeft size={18} /> Recevoir</button>
                <button type="button" onClick={() => setActiveTab('bridge')}><Bitcoin size={18} /> Bridge</button>
                <button type="button" onClick={() => setActiveTab('stake')}><Sparkles size={18} /> Staking</button>
              </div>
            </section>

            <section className="card">
              <h2>Chaîne</h2>
              <div className="metric"><span>Height</span><strong>{chainInfo?.height ?? '-'}</strong></div>
              <div className="metric"><span>Accounts</span><strong>{chainInfo?.accounts ?? '-'}</strong></div>
              <div className="metric"><span>Supply totale</span><strong>{formatUnits(chainInfo?.total_supply)} ITANI</strong></div>
              <div className="metric"><span>Supply circulante</span><strong>{formatUnits(dynamicInfo?.chain_flows?.circulating_supply_units || walletInfo?.circulating_supply)} ITANI</strong></div>
            </section>

            <section className="card">
              <h2>Compte</h2>
              <div className="metric"><span>Metani ID</span><strong>{user.pseudo || user.username}</strong></div>
              <div className="metric"><span>Signer externe</span><strong>{externalAccount ? shorten(externalAccount) : 'Non connecté'}</strong></div>
              <button className="primaryAction compact" type="button" onClick={connectSigner}>Connecter signer</button>
            </section>

            <section className="card wide">
              <h2>Activité récente</h2>
              <ActivityList items={activity.slice(0, 4)} />
            </section>
          </div>
        ) : null}

        {activeTab === 'portfolio' ? (
          <div className="dashboardGrid">
            <section className="balanceCard">
              <div className="balanceHeader"><span>Wallet ITANI</span><Wallet size={18} /></div>
              <strong>{showBalance ? balanceValue : '••••••'} <small>{nativeCurrency.symbol}</small></strong>
              <p>{walletAddress}</p>
              <div className="quickActions">
                <button type="button" onClick={copyAddress}><Copy size={18} /> Copier</button>
                <button type="button" onClick={() => refreshWalletData()}><RefreshCw size={18} /> Actualiser</button>
              </div>
            </section>
            <section className="card">
              <h2>Données wallet</h2>
              <InfoRow label="Adresse" value={walletAddress} />
              <InfoRow label="Balance RPC" value={walletInfo?.balance_formatted || walletInfo?.balance || balance || '-'} />
              <InfoRow label="Transactions envoyées" value={String(walletInfo?.tx_sent_count ?? walletInfo?.sent_count ?? '-')} />
              <InfoRow label="Transactions reçues" value={String(walletInfo?.tx_received_count ?? walletInfo?.received_count ?? '-')} />
            </section>
            <section className="card wide">
              <h2>Historique blockchain</h2>
              <ChainList items={addressHistory?.transactions || addressHistory?.history || []} empty="Aucune transaction trouvée pour ce wallet." />
            </section>
          </div>
        ) : null}

        {activeTab === 'send' ? (
          <section className="card formCard">
            <h2>Envoyer ITANI</h2>
            <p>La transaction est préparée ici et signée dans ton wallet externe.</p>
            <form onSubmit={sendItani}>
              <label>Adresse destinataire</label>
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x..." />
              <label>Montant</label>
              <div className="amountInput">
                <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" />
                <span>ITANI</span>
              </div>
              <button className="primaryAction" type="submit">Signer et envoyer <Send size={18} /></button>
            </form>
          </section>
        ) : null}

        {activeTab === 'receive' ? (
          <section className="card receiveCard">
            <h2>Recevoir ITANI</h2>
            <div className="qrMock" aria-label="Adresse wallet">
              <Wallet size={54} />
            </div>
            <code>{walletAddress}</code>
            <button className="primaryAction compact" type="button" onClick={copyAddress}>Copier l’adresse <Copy size={17} /></button>
          </section>
        ) : null}

        {activeTab === 'stake' ? (
          <section className="card formCard">
            <h2>Staking ITANI</h2>
            <p>Le rendement estimé varie de 1 à 100% selon le montant déposé et la durée choisie.</p>
            <label>Montant à staker</label>
            <div className="amountInput">
              <input value={stakeAmount} onChange={(event) => setStakeAmount(event.target.value)} inputMode="decimal" placeholder="0.00" />
              <span>ITANI</span>
            </div>
            <label>Durée: {stakeDuration} jours</label>
            <input type="range" min="1" max="365" value={stakeDuration} onChange={(event) => setStakeDuration(Number(event.target.value))} />
            <div className="ratePanel">
              <span>Taux estimé</span>
              <strong>{stakeRate}%</strong>
            </div>
            <button className="primaryAction" type="button" onClick={stakeItani}>Signer le staking <Sparkles size={18} /></button>
          </section>
        ) : null}

        {activeTab === 'tokens' ? (
          <div className="dashboardGrid">
            <section className="card wide">
              <h2>Tokens déployés</h2>
              <p>Registre on-chain des tokens déployés sur iTani Network Chain.</p>
              <ChainList items={tokensInfo?.tokens || []} empty="Aucun token déployé enregistré pour le moment." />
            </section>
            <section className="card">
              <h2>Politique token</h2>
              <InfoRow label="Tokens" value={String(tokensInfo?.count ?? 0)} />
              <InfoRow label="Fee deploy" value={`${tokensInfo?.policy?.fee_percent ?? '-'}%`} />
              <InfoRow label="Exchange fee" value={`${tokensInfo?.policy?.exchange_fee_bps ?? '-'} bps`} />
            </section>
          </div>
        ) : null}

        {activeTab === 'nfts' ? (
          <div className="dashboardGrid">
            <section className="card">
              <h2>Mes NFTs</h2>
              <ChainList items={walletNfts?.tokens || walletNfts?.nfts || []} empty="Aucun NFT dans ce wallet." />
            </section>
            <section className="card">
              <h2>Collections</h2>
              <ChainList items={collectionItems} empty="Aucune collection NFT enregistrée." />
            </section>
            <section className="card wide">
              <h2>Marketplace NFT</h2>
              <p className="sectionNote">Listings publics depuis Metani NFT Box. Mint et achat réels restent verrouillés jusqu'à audit.</p>
              <NftMarketplaceList items={marketplaceItems} empty="Aucun NFT listé sur la marketplace." />
            </section>
          </div>
        ) : null}

        {activeTab === 'explorer' ? (
          <div className="dashboardGrid">
            <section className="card wide formCard">
              <h2>Explorer iTani</h2>
              <form onSubmit={searchChain}>
                <label>Recherche adresse, transaction ou bloc</label>
                <div className="searchLine">
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Adresse, iTx..., 0x..., ou numéro de bloc" />
                  <button className="primaryAction compact" type="submit"><Database size={18} /> Chercher</button>
                </div>
              </form>
              <ExplorerResult data={searchResult} />
            </section>
            <StatCard label="Height" value={String(chainInfo?.height ?? '-')} icon={Blocks} />
            <StatCard label="Chain ID" value={String(chainInfo?.chain_id ?? activeNetwork.chainId)} icon={Network} />
            <StatCard label="Consensus" value={chainInfo?.consensus || '-'} icon={ShieldCheck} />
            <StatCard label="EVM" value={chainInfo?.evm_compatible ? 'Compatible' : 'Non confirmé'} icon={BadgeCheck} />
          </div>
        ) : null}

        {activeTab === 'bridge' ? (
          <section className="card swapCard">
            <h2>Bridge et BTC</h2>
            <p>Le bridge est visible en lecture, mais les écritures mainnet restent verrouillées tant que l’audit bridge/custody n’est pas validé.</p>
            {BRIDGE_READ_ONLY ? <div className="alert error">Bridge verrouillé en production. Aucun retrait ou lock réel ne doit être lancé sans audit et signer externe.</div> : null}
            <form className="btcForm" onSubmit={buyBtcWithItani}>
              <label>Montant ITANI</label>
              <div className="amountInput">
                <input value={btcItaniAmount} onChange={(event) => setBtcItaniAmount(event.target.value)} inputMode="decimal" placeholder="10000" />
                <span>ITANI</span>
              </div>
              <div className="btcQuote">
                <span>Tu reçois</span>
                <strong>{btcQuote.toFixed(8)} BTC</strong>
                <small>{btcSatoshis.toLocaleString()} satoshis</small>
              </div>
              <label>Adresse BTC de retrait optionnelle</label>
              <input value={btcDestination} onChange={(event) => setBtcDestination(event.target.value)} placeholder="bc1... ou 1... / 3..." />
              <button className="primaryAction" type="submit" disabled={BRIDGE_READ_ONLY}>Signer l’achat BTC <Bitcoin size={18} /></button>
            </form>
            <a className="secondaryAction" href={activeNetwork.swapUrls?.[0] || 'https://hudlife.itaninetworkchain.com/swap'} target="_blank" rel="noreferrer">
              Ouvrir iTaniSwap <ExternalLink size={18} />
            </a>
          </section>
        ) : null}

        {activeTab === 'activity' ? (
          <section className="card">
            <h2>Activité</h2>
            <ActivityList items={activity} />
          </section>
        ) : null}
      </section>

      <nav className="mobileNav" aria-label="Navigation mobile">
        {tabs.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={activeTab === item.id ? 'active' : ''} type="button" onClick={() => setActiveTab(item.id)}>
              <Icon size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="infoRow">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <section className="statCard">
      <span><Icon size={20} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </section>
  );
}

function ChainList({ items, empty }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return (
      <div className="emptyState compact">
        <Layers size={24} />
        <strong>{empty}</strong>
      </div>
    );
  }

  return (
    <div className="chainList">
      {list.slice(0, 25).map((item, index) => {
        const id = item.id || item.tx_id || item.hash || item.token_id || item.contract_address || item.address || `item-${index}`;
        const title = item.name || item.symbol || item.type || item.method || item.tx_id || item.hash || id;
        const detail = item.description || item.status || item.owner || item.from || item.to || item.contract_address || item.address || '';
        return (
          <div className="chainItem" key={id}>
            <strong>{shorten(String(title), 18, 10)}</strong>
            <small>{detail ? shorten(String(detail), 18, 12) : JSON.stringify(item).slice(0, 120)}</small>
          </div>
        );
      })}
    </div>
  );
}

function NftMarketplaceList({ items, empty }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return (
      <div className="emptyState compact">
        <Image size={24} />
        <strong>{empty}</strong>
      </div>
    );
  }

  return (
    <div className="nftGrid">
      {list.slice(0, 12).map((item, index) => {
        const id = item.id || item.token_id || `nft-${index}`;
        const title = item.name || item.token_id || id;
        const traits = Array.isArray(item.traits) ? item.traits : [];
        return (
          <article className="nftCard" key={id}>
            <div className="nftThumb">
              {item.image_url ? <img src={item.image_url} alt={title} loading="lazy" /> : <Image size={42} />}
            </div>
            <div className="nftBody">
              <div className="nftTitleLine">
                <strong>{title}</strong>
                <span className="statusBadge">{item.status || 'listed'}</span>
              </div>
              <small>{item.collection || item.contract_address || 'Metani NFT'}</small>
              {item.description ? <p>{item.description}</p> : null}
              {item.price ? <b>{item.price}</b> : null}
              {traits.length ? (
                <div className="traitPills">
                  {traits.slice(0, 6).map((trait) => (
                    <span key={`${id}-${trait.trait_type}-${trait.value}`}>
                      {trait.trait_type}: {trait.value}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ExplorerResult({ data }) {
  if (!data) return null;
  if (data.loading) {
    return <div className="emptyState compact"><Loader2 className="spin" size={22} /><strong>Recherche...</strong></div>;
  }
  if (data.error) {
    return <div className="alert error">{data.error}</div>;
  }
  return (
    <pre className="resultBox">{JSON.stringify(data.result, null, 2)}</pre>
  );
}

function ActivityList({ items }) {
  if (!items.length) {
    return (
      <div className="emptyState">
        <Layers size={28} />
        <strong>Aucune activité</strong>
        <span>Les connexions, envois et opérations staking apparaîtront ici.</span>
      </div>
    );
  }

  return (
    <div className="activityList">
      {items.map((item) => (
        <div className="activityItem" key={item.id}>
          <span className={`activityIcon ${item.type || 'default'}`}><ChevronRight size={16} /></span>
          <div>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </div>
          <time>{new Date(item.created_at).toLocaleDateString()}</time>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
