import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  History,
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
const ITANI_PER_BTC = Number(import.meta.env.VITE_ITANI_BTC_RATE || 10000);
const SATOSHIS_PER_BTC = 100000000;

const tabs = [
  { id: 'home', label: 'Accueil', icon: Wallet },
  { id: 'send', label: 'Envoyer', icon: ArrowUpRight },
  { id: 'receive', label: 'Recevoir', icon: ArrowDownLeft },
  { id: 'stake', label: 'Staking', icon: Sparkles },
  { id: 'swap', label: 'Swap', icon: Repeat2 },
  { id: 'network', label: 'Réseau', icon: Network },
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

function AuthScreen({ error, status }) {
  return (
    <main className="authShell">
      <section className="authCard">
        <div className="authVisual">
          <div className="orbital">
            <span><Wallet size={40} /></span>
          </div>
          <p className="eyebrow">iTani Network Chain</p>
          <h1>Un wallet professionnel pour ton Metani ID</h1>
          <p>
            Inscription, connexion, réception, envoi, staking et swap ITANI depuis une interface simple, sécurisée et mobile-first.
          </p>
          <div className="trustList">
            <span><ShieldCheck size={16} /> SSO HudLife</span>
            <span><LockKeyhole size={16} /> Clés hors frontend</span>
            <span><Network size={16} /> Chain ID 1229800785</span>
          </div>
        </div>

        <div className="authPanel">
          <div className="walletLogo">
            <span><Wallet size={22} /></span>
            <div>
              <strong>inc_wallet</strong>
              <small>ITANI wallet</small>
            </div>
          </div>
          <h2>Commencer</h2>
          <p>Crée ou connecte ton compte Metani. Le même wallet sera reconnu par HudLife, ArtLinks et HudWorld.</p>
          {error ? <div className="alert error">{error}</div> : null}
          <a className="primaryAction" href={getAuthUrl('register')}>
            Créer mon Metani ID <ArrowRight size={18} />
          </a>
          <a className="secondaryAction" href={getAuthUrl('login')}>
            J’ai déjà un compte
          </a>
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

  const walletAddress = user?.wallet_address || user?.address || '';
  const displayName = user?.display_name || user?.username || user?.pseudo || 'Compte Metani';
  const balanceValue = parseBalanceText(balance);
  const btcQuote = useMemo(() => itaniToBtc(btcItaniAmount), [btcItaniAmount]);
  const btcSatoshis = useMemo(() => btcToSatoshis(btcQuote), [btcQuote]);
  const stakeRate = useMemo(() => {
    const amountScore = Math.min(Math.max(Number(stakeAmount || 0) / 10000, 0), 1);
    const durationScore = Math.min(Math.max(Number(stakeDuration || 1) / 365, 0), 1);
    return Math.min(100, Math.max(1, Math.round(1 + amountScore * 49 + durationScore * 50)));
  }, [stakeAmount, stakeDuration]);

  useEffect(() => {
    const incoming = getIncomingToken();
    const token = incoming || localStorage.getItem(SSO_TOKEN_KEY);

    setStatus('verification');
    verifySso(token)
      .then((data) => {
        setUser(data.user);
        setBalance(data.balance_formatted || `${data.balance || '0'} ${nativeCurrency.symbol}`);
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
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus('prêt');
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

  if (!user) return <AuthScreen error={error} status={status} />;

  const tab = tabs.find((item) => item.id === activeTab) || tabs[0];

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="walletLogo">
          <span><Wallet size={22} /></span>
          <div>
            <strong>inc_wallet</strong>
            <small>iTani Network</small>
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
            <button className="networkPill" type="button" onClick={() => setActiveTab('network')}>
              <span />
              {activeNetwork.chainName}
            </button>
          </div>
        </header>

        {error ? <div className="alert error">{error}</div> : null}
        {txHash ? <div className="alert success">{txHash}</div> : null}

        {activeTab === 'home' ? (
          <div className="dashboardGrid">
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
                <button type="button" onClick={() => setActiveTab('swap')}><Bitcoin size={18} /> Acheter BTC</button>
                <button type="button" onClick={() => setActiveTab('stake')}><Sparkles size={18} /> Staking</button>
              </div>
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

        {activeTab === 'swap' ? (
          <section className="card swapCard">
            <h2>Acheter BTC avec ITANI</h2>
            <p>Taux fixe configuré: 10 000 ITANI = 1 BTC. Le swap crédite d’abord ITABTC/iWBTC sur iTani; le retrait BTC L1 dépend du bridge Bitcoin.</p>
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
              <button className="primaryAction" type="submit">Signer l’achat BTC <Bitcoin size={18} /></button>
            </form>
            <a className="secondaryAction" href={activeNetwork.swapUrls?.[0] || 'https://hudlife.itaninetworkchain.com/swap'} target="_blank" rel="noreferrer">
              Ouvrir iTaniSwap <ExternalLink size={18} />
            </a>
          </section>
        ) : null}

        {activeTab === 'network' ? (
          <section className="card networkCard">
            <h2>Réseau</h2>
            <InfoRow label="Nom" value={activeNetwork.chainName} />
            <InfoRow label="Chain ID" value={String(activeNetwork.chainId)} />
            <InfoRow label="RPC principal" value={activeNetwork.rpcUrls[0]} />
            <InfoRow label="Relay REST" value={activeNetwork.restUrls[0]} />
            <InfoRow label="Explorer" value={activeNetwork.blockExplorerUrls[0]} />
            <button className="primaryAction compact" type="button" onClick={connectSigner}>Ajouter au wallet externe</button>
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
