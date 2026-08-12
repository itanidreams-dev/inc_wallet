import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import * as THREE from 'three';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Blocks,
  Camera,
  ChevronRight,
  Coins,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Gauge,
  Globe2,
  History,
  Image,
  Layers,
  Landmark,
  Loader2,
  LockKeyhole,
  LogOut,
  Network,
  Palette,
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
const METANI_SHARED_SSO_TOKEN_KEY = 'metani_sso_token';
const SSO_USER_KEY = 'itani_sso_user';
const ACTIVITY_KEY = 'inc_wallet_activity';
const METANI_PORTAL = (
  import.meta.env.VITE_METANI_PORTAL_URL ||
  import.meta.env.VITE_HUDLIFE_PORTAL_URL ||
  (import.meta.env.DEV ? 'http://localhost:3050' : 'https://metani.itaninetworkchain.com')
).replace(/\/+$/, '');
const METANI_SSO = (
  import.meta.env.VITE_METANI_SSO_URL ||
  import.meta.env.VITE_HUDLIFE_SSO_URL ||
  `${METANI_PORTAL}/api/sso`
).replace(/\/+$/, '');
const CLIENT_ID = import.meta.env.VITE_METANI_SSO_CLIENT_ID || import.meta.env.VITE_ITANI_SSO_CLIENT_ID || 'inc-wallet-web';
const ITANI_PAY_API = (import.meta.env.VITE_ITANI_PAY_API_URL || 'https://pay.itaninetworkchain.com').replace(/\/+$/, '');
const STAKING_ENDPOINT =
  import.meta.env.VITE_ITANI_STAKING_ENDPOINT ||
  'https://node.itaninetworkchain.com/api/wallet/stake-tokens';
const activeNetwork = network.mainnet || network;
const nativeCurrency = activeNetwork.nativeCurrency || network.nativeCurrency;
const JSON_RPC_ENDPOINT = activeNetwork?.rpcUrls?.[0] || 'https://node.itaninetworkchain.com/jsonrpc';
const NFT_BOX_ENDPOINT = import.meta.env.VITE_NFT_BOX_ENDPOINT || '/nft-marketplace.json';
const ITANI_PER_BTC = Number(import.meta.env.VITE_ITANI_BTC_RATE || 10000);
const SATOSHIS_PER_BTC = 100000000;
const BRIDGE_READ_ONLY = true;
const MARKET_NOT_LISTED = 'Non coté';
const MARKET_LIVE = import.meta.env.VITE_ITANI_MARKET_LIVE !== 'false';
const sheikMoods = [
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'noir', label: 'Noir' },
  { id: 'bleu', label: 'Bleu' },
  { id: 'blanc', label: 'Blanc' },
  { id: 'rouge', label: 'Rouge' },
  { id: 'jean', label: 'Jean' },
  { id: 'vert', label: 'Vert' },
  { id: 'gris', label: 'Gris' },
];

const FIAT_CHOICES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'XOF', 'MAD'];
const METANI_ASSET_ORDER = ['ITANI', 'AR', 'YUM', 'BES', 'HOS'];

function formatAssetBalance(value, decimals = 3) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(n);
}


function parsePaymentQrPayload(payload = '') {
  const value = String(payload || '').trim();
  if (!value) return { address: '', amount: '' };
  try {
    const normalized = value.replace(/^web\+itani:/i, 'itani:');
    const uri = normalized.match(/^[a-z][a-z0-9+.-]*:/i) ? new URL(normalized) : null;
    if (uri) {
      const address = uri.protocol === 'itani:' || uri.protocol === 'ethereum:' ? decodeURIComponent(uri.pathname || uri.host || '').replace(/^\/+/, '') : '';
      const amount = uri.searchParams.get('amount') || uri.searchParams.get('value') || '';
      return { address: address || value, amount };
    }
  } catch {
    // Plain wallet addresses are valid QR payloads.
  }
  const parts = value.split(/\s+/).filter(Boolean);
  const address = parts.find((part) => /^0x[a-fA-F0-9]{40}$/.test(part) || /^iT[a-zA-Z0-9]{20,}$/.test(part)) || value;
  return { address, amount: '' };
}

function formatFiatAmount(amount, currency = 'EUR') {
  const value = Number(amount || 0);
  const normalizedCurrency = String(currency || 'EUR').toUpperCase();
  if (!Number.isFinite(value)) return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: normalizedCurrency, maximumFractionDigits: 2 }).format(0);
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: normalizedCurrency, maximumFractionDigits: 2 }).format(value);
}

function formatFiatQuote(quote) {
  if (!quote || typeof quote !== 'object') return 'Prix reel indisponible';
  const amount = Number(quote.amount ?? quote.value ?? 0);
  const currency = quote.currency || 'EUR';
  if (!Number.isFinite(amount)) return 'Prix reel indisponible';
  return formatFiatAmount(amount, currency);
}

function realFiatQuoteValue(quote, expectedCurrency = 'EUR') {
  if (!quote || typeof quote !== 'object') return null;
  const quoteCurrency = String(quote.currency || '').toUpperCase();
  if (quoteCurrency !== String(expectedCurrency || 'EUR').toUpperCase()) return null;
  if (quote.indicative === true || quote.market_verified !== true) return null;
  const value = Number(quote.value ?? quote.amount ?? 0);
  return Number.isFinite(value) ? value : null;
}

function pickFirstValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function cardLast4(card = {}) {
  const explicit = pickFirstValue(card, ['last4', 'card_last4']);
  if (explicit) return explicit.slice(-4);
  const raw = pickFirstValue(card, ['pan', 'card_number', 'number', 'full_number', 'cardNumber', 'card_number_masked']);
  const digits = raw.replace(/\D/g, '');
  return digits ? digits.slice(-4) : '';
}

function maskedCardNumber(card = {}) {
  const last4 = cardLast4(card);
  return last4 ? `•••• •••• •••• ${last4}` : '•••• •••• •••• ••••';
}

function fullCardNumber(card = {}) {
  return pickFirstValue(card, ['pan', 'card_number', 'number', 'full_number', 'cardNumber']);
}

function cardExpiry(card = {}) {
  const direct = pickFirstValue(card, ['expiration', 'expiry', 'exp', 'expiration_date']);
  if (direct) return direct;
  const month = pickFirstValue(card, ['exp_month', 'expiry_month', 'expiration_month']);
  const year = pickFirstValue(card, ['exp_year', 'expiry_year', 'expiration_year']);
  if (!month || !year) return '';
  return `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
}

function cardCvc(card = {}) {
  return pickFirstValue(card, ['cvc', 'cvv', 'security_code']);
}

function sortMetaniAssets(assets = []) {
  return [...assets].sort((a, b) => {
    const ai = METANI_ASSET_ORDER.indexOf(String(a.currency || a.code || '').toUpperCase());
    const bi = METANI_ASSET_ORDER.indexOf(String(b.currency || b.code || '').toUpperCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

const OFFICIAL_LINKS = [
  { label: 'Explorer', href: 'https://explorer.itaninetworkchain.com' },
  { label: 'RPC public', href: 'https://node.itaninetworkchain.com/jsonrpc' },
  { label: 'Faire tourner un nœud', href: 'https://github.com/itanidreams-dev/iTani-Network-Chain-mainnet#démarrage-rapide' },
];

const tabs = [
  { id: 'home', label: 'Dashboard', icon: BarChart3 },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet },
  { id: 'accounts', label: 'Comptes', icon: Landmark },
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
  const hashValue = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash || '';
  const hashUrl = new URL(`${window.location.origin}${window.location.pathname}${hashValue}`);
  return (
    url.searchParams.get('sso_token') ||
    url.searchParams.get('token') ||
    hashUrl.searchParams.get('sso_token') ||
    hashUrl.searchParams.get('token')
  );
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
  const url = new URL(`${METANI_PORTAL}/login`);
  url.searchParams.set('app', 'inc_wallet');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', `${window.location.origin}${window.location.pathname}`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('provider', 'metani');
  return url.toString();
}

async function fetchJson(url, options = {}) {
  const { headers = {}, credentials = 'same-origin', ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    credentials,
    headers: {
      Accept: 'application/json',
      ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
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
  const data = await fetchJson(`${METANI_SSO}/verify?${params.toString()}`, { credentials: 'include' });
  if (!data.valid || !data.user) throw new Error(data.error || 'Session Metani invalide');
  const resolvedToken = token || data.sso_token || data.token;
  if (resolvedToken) {
    localStorage.setItem(SSO_TOKEN_KEY, resolvedToken);
    localStorage.setItem(METANI_SHARED_SSO_TOKEN_KEY, resolvedToken);
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

async function ensureExternalWallet(expectedAddress, options = {}) {
  const { allowInternalMetaniSigner = false } = options;
  const expected = String(expectedAddress || '').trim();
  const isInternalMetaniAddress = /^iT[a-zA-Z0-9]{20,}$/.test(expected);
  if (!window.ethereum) {
    if (allowInternalMetaniSigner && isInternalMetaniAddress) return expected;
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

  if (expected?.startsWith?.('0x') && account.toLowerCase() !== expected.toLowerCase()) {
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

function hasUserMarketActivity(dynamicInfo, chainInfo) {
  const userTransactions = Number(dynamicInfo?.chain_flows?.user_transactions || 0);
  const eurReserve = Number(chainInfo?.amm?.amm_eur_reserve_nano || dynamicInfo?.amm_pool?.eur_reserve_nano || 0);
  const itaniReserve = Number(chainInfo?.amm?.amm_iTani_reserve || dynamicInfo?.amm_pool?.iTani_reserve || 0);
  return userTransactions > 0 && eurReserve > 0 && itaniReserve > 0;
}


function BankToolCube3D({ active = false, children, label }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    if (!window.WebGLRenderingContext) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(3.6, 3.2, 5.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(132, 132);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.className = 'cube3dCanvas';
    mount.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    const group = new THREE.Group();
    scene.add(group);

    const colors = active
      ? [0x4ade80, 0x22d3ee, 0xfde68a, 0x0f766e]
      : [0x1f7a8c, 0x114e64, 0x0f2538, 0x2dd4bf];
    const geometry = new THREE.BoxGeometry(0.78, 0.78, 0.78, 3, 3, 3);
    const edgesGeometry = new THREE.EdgesGeometry(geometry);
    const grid = [-0.82, 0, 0.82];
    grid.forEach((x, xi) => {
      grid.forEach((y, yi) => {
        grid.forEach((z, zi) => {
          const material = new THREE.MeshStandardMaterial({
            color: colors[(xi + yi + zi) % colors.length],
            roughness: 0.42,
            metalness: active ? 0.28 : 0.16,
            transparent: true,
            opacity: 0.94,
          });
          const cube = new THREE.Mesh(geometry, material);
          cube.position.set(x, y, z);
          group.add(cube);
          const edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: active ? 0xe0fbff : 0x7dd3fc, transparent: true, opacity: 0.22 }));
          edges.position.copy(cube.position);
          group.add(edges);
        });
      });
    });

    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 6, 4);
    scene.add(key);
    const rim = new THREE.PointLight(active ? 0x22d3ee : 0x38bdf8, 3.8, 12);
    rim.position.set(-3, -2, 4);
    scene.add(rim);

    let frame = 0;
    let raf = 0;
    const animate = () => {
      frame += 0.012;
      group.rotation.x = -0.42 + Math.sin(frame) * 0.04;
      group.rotation.y += active ? 0.012 : 0.006;
      group.rotation.z = Math.sin(frame * 0.7) * 0.025;
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(raf);
      geometry.dispose();
      edgesGeometry.dispose();
      group.traverse((node) => {
        if (node.material) node.material.dispose?.();
      });
      renderer.dispose();
      if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      rendererRef.current = null;
    };
  }, [active]);

  return (
    <span className="cube3dWrap" aria-label={label}>
      <span ref={mountRef} className="cube3dMount" />
      <span className="cube3dIcon">{children}</span>
    </span>
  );
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
          <h1>iTani Kobs App</h1>
          <p>
            Wallet officiel Bitcoin-like pour créer ton compte, voir ton solde ITANI, suivre tes transactions, NFTs, staking et données réseau.
          </p>
          <div className="trustList">
            <span><ShieldCheck size={16} /> SSO Metani</span>
            <span><LockKeyhole size={16} /> Signer externe</span>
            <span><Network size={16} /> Chain ID 1229800785</span>
          </div>
        </div>

        <div className="authPanel">
          <div className="walletLogo">
            <span><Wallet size={22} /></span>
            <div>
              <strong>iTani Kobs App</strong>
              <small>Official wallet</small>
            </div>
          </div>
          <h2>Commencer</h2>
          <p>La connexion et la creation de compte passent uniquement par Metani ID. inc_wallet recupere ensuite automatiquement la session SSO.</p>
          {error ? <div className="alert error">{error}</div> : null}
          <div className="ssoFallback">
            <a className="secondaryAction" href={getAuthUrl('login')}>Connexion Metani</a>
            <a className="secondaryAction" href={getAuthUrl('register')}>Créer un compte Metani</a>
          </div>
          <div className="publicLinks" aria-label="Liens publics iTani">
            {OFFICIAL_LINKS.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                {link.label} <ExternalLink size={14} />
              </a>
            ))}
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
  const [bankData, setBankData] = useState(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankMessage, setBankMessage] = useState('');
  const [transferForm, setTransferForm] = useState({ to: '', amount: '', currency: 'EUR', memo: '' });
  const [cardAddress, setCardAddress] = useState({ full_name: '', line1: '', line2: '', postal_code: '', city: '', country: 'FR', phone: '' });
  const defaultItaniCardLogo = '/itani-card-logo.jpg';
  const [issuingDesign, setIssuingDesign] = useState({ label: 'iTani Card', background_color: '#05070C', accent_color: '#22D3EE', text_color: '#F8FAFC', logo_url: defaultItaniCardLogo, symbols: '', second_line: 'iTani Pay', shipping_service: 'standard' });
  const [issuingQuote, setIssuingQuote] = useState(null);
  const [issuingStatus, setIssuingStatus] = useState(null);
  const [installmentReactivationForm, setInstallmentReactivationForm] = useState({ monthly_due: '', payment_method: 'card', crypto_asset: 'BTC', reason: '' });
  const [sheikForm, setSheikForm] = useState({ amount: '', currency: 'EUR', beneficiary_email: '', beneficiary_name: '', available_at: '', memo: '', mood: 'rainbow' });
  const [sheikRedeemForm, setSheikRedeemForm] = useState({ sheik_id: '', claim_code: '', delivery_name: '', delivery_address: '' });
  const [sheikResult, setSheikResult] = useState(null);
  const [sheikPortraitPremium, setSheikPortraitPremium] = useState(null);
  const [sheikPortraitUrl, setSheikPortraitUrl] = useState('');
  const [preferredFiatCurrency, setPreferredFiatCurrency] = useState('EUR');
  const [metaniWallet, setMetaniWallet] = useState(null);
  const [metaniWalletLoading, setMetaniWalletLoading] = useState(false);
  const [metaniWalletError, setMetaniWalletError] = useState('');
  const [metaniSwapForm, setMetaniSwapForm] = useState({ from_asset: 'ITANI', to_asset: 'AR', amount: '' });
  const [walletExportForm, setWalletExportForm] = useState({ password: '', acknowledged: false });
  const [walletExportResult, setWalletExportResult] = useState(null);
  const [walletExportLoading, setWalletExportLoading] = useState(false);
  const [walletExportVisible, setWalletExportVisible] = useState(false);
  const [receiveQrSvg, setReceiveQrSvg] = useState('');
  const [qrScanMessage, setQrScanMessage] = useState('');
  const [showCardSensitive, setShowCardSensitive] = useState(false);
  const [selectedBankTool, setSelectedBankTool] = useState('bank-financial-account');
  const qrFileInputRef = useRef(null);

  const walletAddress = user?.wallet_address || user?.address || '';
  const displayName = user?.display_name || user?.username || user?.pseudo || 'Compte Metani';
  const balanceValue = parseBalanceText(balance);
  const btcQuote = useMemo(() => itaniToBtc(btcItaniAmount), [btcItaniAmount]);
  const btcSatoshis = useMemo(() => btcToSatoshis(btcQuote), [btcQuote]);
  const btcItaniBonus = metaniWallet?.exchange?.btc_itani_bonus || { enabled: true, percent: 5, bps: 500, label: 'Offre merge/swap BTC vers iTani' };
  const primaryCard = bankData?.account?.virtual_card || {};
  const primaryCardFullNumber = fullCardNumber(primaryCard);
  const primaryCardNumber = showCardSensitive && primaryCardFullNumber ? primaryCardFullNumber.replace(/(\d{4})(?=\d)/g, '$1 ') : maskedCardNumber(primaryCard);
  const primaryCardExpiry = cardExpiry(primaryCard);
  const primaryCardCvc = cardCvc(primaryCard);
  const primaryCardExpiryDisplay = showCardSensitive && primaryCardExpiry ? primaryCardExpiry : (primaryCardExpiry ? '••/••' : 'Non disponible');
  const primaryCardCvcDisplay = showCardSensitive && primaryCardCvc ? primaryCardCvc : (primaryCardCvc ? '•••' : 'Non disponible');
  const issuingReadiness = issuingStatus?.stripe_issuing || {};
  const issuingCardholder = issuingStatus?.cardholder || null;
  const issuingCards = Array.isArray(issuingStatus?.cards) ? issuingStatus.cards : [];
  const kycStatus = bankData?.account?.user?.kyc_status || 'unknown';
  const kycApproved = kycStatus === 'approved';
  const issuingReady = Boolean(issuingReadiness.ready || bankData?.bank_status?.issuing?.ready);
  const cardholderLinked = Boolean(issuingCardholder?.stripe_cardholder_id || bankData?.account?.stripe_issuing?.cardholder_id);
  const canOrderIssuingCard = issuingReady && kycApproved && cardholderLinked;
  const issuingBlockReason = !issuingReady
    ? (issuingReadiness.last_error_message || issuingStatus?.error || 'Stripe Issuing n’est pas encore prêt dans le runtime iTani Pay.')
    : !kycApproved
      ? 'KYC en attente de validation. Le design et le devis restent possibles, la création de carte se débloque après validation.'
      : !cardholderLinked
        ? 'Titulaire Stripe Issuing non lié au compte Metani.'
        : '';
  const cardWorkflowSteps = [
    { label: 'KYC utilisateur', detail: kycApproved ? 'Validé' : `Statut: ${kycStatus}`, state: kycApproved ? 'ready' : 'pending' },
    { label: 'Titulaire Issuing', detail: cardholderLinked ? shorten(issuingCardholder?.stripe_cardholder_id || bankData?.account?.stripe_issuing?.cardholder_id, 10, 6) : 'À créer ou lier après KYC', state: cardholderLinked ? 'ready' : 'pending' },
    { label: 'Design + devis', detail: issuingQuote?.fee_quote ? `${issuingQuote.fee_quote.total} ${issuingQuote.fee_quote.currency}` : 'Préparable maintenant', state: issuingQuote?.fee_quote ? 'ready' : 'pending' },
    { label: 'Émission carte', detail: canOrderIssuingCard ? 'Disponible' : 'Verrouillée', state: canOrderIssuingCard ? 'ready' : 'locked' },
    { label: 'Autorisation temps réel', detail: 'iTani Pay approuve/refuse selon KYC et solde', state: issuingReady ? 'ready' : 'pending' },
  ];
  const collectionItems = nftCollections?.collections?.length ? nftCollections.collections : (nftBox?.collections || []);
  const marketplaceItems = nftMarketplace?.listings?.length ? nftMarketplace.listings : (nftBox?.listings || []);
  const marketIsLive = MARKET_LIVE && hasUserMarketActivity(dynamicInfo, chainInfo);
  const spotPriceDisplay = marketIsLive ? (priceInfo?.spot_price_eur || chainInfo?.amm?.current_price_eur || MARKET_NOT_LISTED) : MARKET_NOT_LISTED;
  const twapDisplay = marketIsLive ? (priceInfo?.twap_eur || chainInfo?.amm?.oracle?.twap_100_nano_eur || MARKET_NOT_LISTED) : MARKET_NOT_LISTED;
  const marketCapDisplay = marketIsLive ? (chainInfo?.amm?.estimated_market_cap_eur || dynamicInfo?.amm_pool?.market_cap_eur || MARKET_NOT_LISTED) : MARKET_NOT_LISTED;
  const stakeRate = useMemo(() => {
    const amountScore = Math.min(Math.max(Number(stakeAmount || 0) / 10000, 0), 1);
    const durationScore = Math.min(Math.max(Number(stakeDuration || 1) / 365, 0), 1);
    return Math.min(100, Math.max(1, Math.round(1 + amountScore * 49 + durationScore * 50)));
  }, [stakeAmount, stakeDuration]);
  useEffect(() => {
    if (!showCardSensitive) return undefined;
    const timeout = window.setTimeout(() => setShowCardSensitive(false), 30000);
    return () => window.clearTimeout(timeout);
  }, [showCardSensitive]);

  useEffect(() => {
    let alive = true;
    if (!walletAddress) {
      setReceiveQrSvg('');
      return () => {
        alive = false;
      };
    }
    QRCode.toString(walletAddress, {
      type: 'svg',
      margin: 2,
      width: 260,
      color: {
        dark: '#07111d',
        light: '#f8fdff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((svg) => {
        if (alive) setReceiveQrSvg(svg);
      })
      .catch(() => {
        if (alive) setReceiveQrSvg('');
      });
    return () => {
      alive = false;
    };
  }, [walletAddress]);

  const rpcItaniBalance = walletInfo?.balance_formatted ? Number(parseBalanceText(walletInfo.balance_formatted)) : null;
  const baseMetaniAssets = useMemo(() => sortMetaniAssets(metaniWallet?.assets || []), [metaniWallet]);
  const metaniAssets = useMemo(() => baseMetaniAssets.map((asset) => {
    const code = String(asset.currency || asset.code || '').toUpperCase();
    if (!['ITANI', 'ITN'].includes(code) || !Number.isFinite(rpcItaniBalance)) return asset;
    return {
      ...asset,
      total_balance: rpcItaniBalance,
      display_balance: rpcItaniBalance,
      onchain_balance: rpcItaniBalance,
      onchain: { ...(asset.onchain || {}), available: true, source: 'eth_getBalance' },
    };
  }), [baseMetaniAssets, rpcItaniBalance]);
  const metaniAssetByCurrency = useMemo(() => Object.fromEntries(metaniAssets.map((asset) => [String(asset.currency || asset.code || '').toUpperCase(), asset])), [metaniAssets]);
  const officialItaniCandidates = [metaniAssetByCurrency.ITANI, metaniAssetByCurrency.ITN].filter(Boolean);
  const officialItaniAsset = officialItaniCandidates.find((asset) => Number(asset.total_balance ?? asset.display_balance ?? asset.ledger_balance ?? asset.onchain_balance ?? 0) > 0) || officialItaniCandidates[0] || null;
  const officialItaniBalance = Number.isFinite(rpcItaniBalance)
    ? rpcItaniBalance
    : officialItaniAsset
      ? Number(officialItaniAsset.total_balance ?? officialItaniAsset.display_balance ?? officialItaniAsset.ledger_balance ?? officialItaniAsset.onchain_balance ?? 0)
      : Number(balanceValue || 0);
  const officialItaniDisplay = officialItaniAsset || Number.isFinite(rpcItaniBalance)
    ? formatAssetBalance(officialItaniBalance, officialItaniAsset?.display_decimals ?? 3)
    : balanceValue;
  const officialItaniSymbol = officialItaniAsset?.symbol || nativeCurrency.symbol || 'ITANI';
  const officialItaniSource = Number.isFinite(rpcItaniBalance)
    ? `RPC officiel ${formatAssetBalance(rpcItaniBalance, officialItaniAsset?.display_decimals ?? 3)} · Ledger ${formatAssetBalance(officialItaniAsset?.wallet_balance, officialItaniAsset?.display_decimals ?? 3)} · App ${formatAssetBalance(officialItaniAsset?.app_balance, officialItaniAsset?.display_decimals ?? 3)}`
    : officialItaniAsset
      ? `Ledger ${formatAssetBalance(officialItaniAsset.wallet_balance, officialItaniAsset.display_decimals ?? 3)} · App ${formatAssetBalance(officialItaniAsset.app_balance, officialItaniAsset.display_decimals ?? 3)} · Chain ${formatAssetBalance(officialItaniAsset.onchain_balance, officialItaniAsset.display_decimals ?? 3)}`
      : 'Ancien RPC direct';
  const officialArtRingAsset = metaniAssetByCurrency.AR || null;
  const globalFiatSummary = useMemo(() => {
    const currency = String(preferredFiatCurrency || 'EUR').toUpperCase();
    let total = 0;
    let bankTotal = 0;
    let cryptoTotal = 0;
    let pricedAssets = 0;
    let unpricedAssets = 0;
    for (const [balanceCurrency, rawValue] of Object.entries(bankData?.balances || {})) {
      if (String(balanceCurrency || '').toUpperCase() !== currency) continue;
      const value = Number(rawValue || 0);
      if (Number.isFinite(value)) {
        bankTotal += value;
        total += value;
      }
    }
    for (const asset of metaniAssets) {
      const assetBalance = Number(asset.total_balance ?? asset.display_balance ?? 0);
      if (!Number.isFinite(assetBalance) || assetBalance <= 0) continue;
      const quoteValue = realFiatQuoteValue(asset.fiat_preferred, currency);
      if (quoteValue === null) {
        unpricedAssets += 1;
        continue;
      }
      cryptoTotal += quoteValue;
      total += quoteValue;
      pricedAssets += 1;
    }
    return {
      currency,
      total: Number(total.toFixed(2)),
      bankTotal: Number(bankTotal.toFixed(2)),
      cryptoTotal: Number(cryptoTotal.toFixed(2)),
      pricedAssets,
      unpricedAssets,
    };
  }, [bankData, metaniAssets, preferredFiatCurrency]);

  async function refreshChainData() {
    const chainInfoResult = await jsonRpc('get_chain_info').catch((err) => {
      setError((current) => current || err.message || 'RPC iTani indisponible.');
      return null;
    });
    if (chainInfoResult) setChainInfo(pickResult(chainInfoResult));
    const [price, dynamic, staking, tokens, collections, marketplace, nftBoxSeed] = await Promise.allSettled([
      jsonRpc('oracle_get_price'),
      jsonRpc('get_dynamic_rate'),
      jsonRpc('get_staking_info'),
      jsonRpc('get_deployed_tokens'),
      jsonRpc('nft_collections'),
      jsonRpc('nft_marketplace'),
      fetchJson(NFT_BOX_ENDPOINT),
    ]);
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

  async function bankRequest(path, options = {}) {
    const token = localStorage.getItem(SSO_TOKEN_KEY) || localStorage.getItem(METANI_SHARED_SSO_TOKEN_KEY);
    if (!token) throw new Error('Connexion Metani requise.');
    return fetchJson(`${ITANI_PAY_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  }

  async function exportMetaniWallet(event) {
    event.preventDefault();
    setError('');
    setTxHash('');
    setWalletExportResult(null);
    if (!walletExportForm.acknowledged) {
      setError('Confirme d’abord que tu ne partageras jamais cette clé.');
      return;
    }
    if (!walletExportForm.password) {
      setError('Mot de passe Metani requis pour afficher la clé.');
      return;
    }
    const token = localStorage.getItem(SSO_TOKEN_KEY) || localStorage.getItem(METANI_SHARED_SSO_TOKEN_KEY);
    if (!token) {
      setError('Session Metani requise.');
      return;
    }
    setWalletExportLoading(true);
    try {
      const data = await fetchJson(METANI_SSO + '/wallet/export', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ password: walletExportForm.password }),
      });
      setWalletExportResult(data);
      setWalletExportVisible(false);
      setWalletExportForm({ password: '', acknowledged: true });
      setTxHash('Clé exportée dans Kobs. Ne la partage jamais dans un message.');
      window.setTimeout(() => setWalletExportResult(null), 120000);
    } catch (err) {
      setError(err.message || 'Export wallet impossible.');
    } finally {
      setWalletExportLoading(false);
    }
  }

  async function copyExportedPrivateKey() {
    if (!walletExportResult?.private_key) return;
    await navigator.clipboard.writeText(walletExportResult.private_key);
    setTxHash('Clé privée copiée. Importe-la dans MetaMask puis ferme cet écran.');
  }
  async function refreshMetaniWallet(currency = preferredFiatCurrency) {
    setMetaniWalletLoading(true);
    try {
      const data = await bankRequest(`/api/metani/wallet/assets?app=inc_wallet&preferred_currency=${encodeURIComponent(currency)}`);
      setMetaniWallet(data);
      setMetaniWalletError('');
      return data;
    } catch (err) {
      setMetaniWalletError(err.message || 'Portefeuille Metani indisponible.');
      setError((current) => current || err.message || 'Portefeuille Metani indisponible.');
      return null;
    } finally {
      setMetaniWalletLoading(false);
    }
  }

  async function executeMetaniSwap(event) {
    event.preventDefault();
    setError('');
    setTxHash('');
    const amountValue = Number(metaniSwapForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      setError('Montant de swap invalide.');
      return;
    }
    try {
      const result = await bankRequest('/api/metani/wallet/swap', {
        method: 'POST',
        body: JSON.stringify(metaniSwapForm),
      });
      setTxHash(`Swap confirme: ${formatAssetBalance(result.amount)} ${result.from_asset} vers ${formatAssetBalance(result.receive)} ${result.to_asset}`);
      setMetaniSwapForm({ ...metaniSwapForm, amount: '' });
      writeActivity({ type: 'swap', title: 'Swap Kobs officiel', detail: `${result.from_asset} → ${result.to_asset}` });
      setActivity(readJson(ACTIVITY_KEY, []));
      await refreshMetaniWallet();
    } catch (err) {
      setError(err.message || 'Swap Metani impossible.');
    }
  }

  async function refreshBankData() {
    setBankLoading(true);
    try {
      const [data, issuing] = await Promise.all([
        bankRequest('/api/banks/me'),
        bankRequest('/api/banks/me/issuing/status').catch((err) => ({ success: false, error: err.message || 'Statut Stripe Issuing indisponible.' })),
      ]);
      setBankData(data);
      setIssuingStatus(issuing);
      bankRequest('/api/banks/me/sheiks/portrait-premium').then((premium) => setSheikPortraitPremium(premium.portrait_premium)).catch(() => {});
      setBankMessage('Compte iTani Bank synchronisé');
      setError('');
      return data;
    } catch (err) {
      setBankMessage('');
      setIssuingStatus((current) => current || { success: false, error: 'Compte iTani Bank indisponible.' });
      setError(err.message || 'Compte iTani Bank indisponible.');
      return null;
    } finally {
      setBankLoading(false);
    }
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
      refreshBankData(),
      refreshMetaniWallet(),
    ]);
    writeActivity({
      type: source,
      title: source === 'register' ? 'Compte Metani créé' : 'Compte Metani connecté',
      detail: account.pseudo || account.email || account.wallet_address || account.address || 'Email/password',
    });
    setActivity(readJson(ACTIVITY_KEY, []));
  }

  async function handleEmailAuth(mode) {
    window.location.href = getAuthUrl(mode === 'register' ? 'register' : 'login');
  }

  useEffect(() => {
    const incoming = getIncomingToken();
    const token = incoming || localStorage.getItem(SSO_TOKEN_KEY) || localStorage.getItem(METANI_SHARED_SSO_TOKEN_KEY);

    refreshChainData().catch(() => {});
    setStatus('verification');
    verifySso(token)
      .then((data) => {
        setUser(data.user);
        setBalance(data.balance_formatted || `${data.balance || '0'} ${nativeCurrency.symbol}`);
        refreshWalletData(data.user?.wallet_address || data.user?.address).catch(() => {});
        refreshBankData().catch(() => {});
        refreshMetaniWallet().catch(() => {});
        writeActivity({ type: 'sso', title: 'Session Metani connectée', detail: data.user?.pseudo || data.user?.address || 'SSO Metani' });
        setActivity(readJson(ACTIVITY_KEY, []));
      })
      .catch((err) => {
        if (token) {
          setError(err.message);
        }
        localStorage.removeItem(SSO_TOKEN_KEY);
        localStorage.removeItem(METANI_SHARED_SSO_TOKEN_KEY);
        localStorage.removeItem(SSO_USER_KEY);
      })
      .finally(() => {
        cleanUrl();
        setStatus('prêt');
      });
  }, []);

  useEffect(() => {
    if (activeTab === 'accounts' && user) {
      refreshBankData().catch(() => {});
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (!user || !['home', 'portfolio', 'accounts'].includes(activeTab)) return undefined;
    refreshMetaniWallet(preferredFiatCurrency).catch(() => {});
    const timer = window.setInterval(() => {
      refreshMetaniWallet(preferredFiatCurrency).catch(() => {});
      refreshWalletData(walletAddress).catch(() => {});
      if (activeTab === 'accounts') refreshBankData().catch(() => {});
    }, 20000);
    return () => window.clearInterval(timer);
  }, [activeTab, user, walletAddress, preferredFiatCurrency]);

  async function refreshSession() {
    const token = localStorage.getItem(SSO_TOKEN_KEY) || localStorage.getItem(METANI_SHARED_SSO_TOKEN_KEY);
    if (!token) return;
    setStatus('sync');
    try {
      const data = await verifySso(token);
      setUser(data.user);
      setBalance(data.balance_formatted || `${data.balance || '0'} ${nativeCurrency.symbol}`);
      await Promise.allSettled([
        refreshChainData(),
        refreshWalletData(data.user?.wallet_address || data.user?.address),
        refreshBankData(),
        refreshMetaniWallet(),
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
    localStorage.removeItem(METANI_SHARED_SSO_TOKEN_KEY);
    localStorage.removeItem(SSO_USER_KEY);
    setUser(null);
    setBalance(null);
  }

  async function copyAddress() {
    if (!walletAddress) return;
    await navigator.clipboard.writeText(walletAddress);
    setStatus('adresse copiée');
  }

  async function copyCardField(label, value) {
    if (!value || value === 'Non disponible') {
      setError(`${label} indisponible pour cette carte.`);
      return;
    }
    await navigator.clipboard.writeText(String(value).replace(/\s+/g, ' ').trim());
    setStatus(`${label} copié`);
  }

  async function connectSigner() {
    try {
      const account = await ensureExternalWallet(walletAddress, { allowInternalMetaniSigner: true });
      setExternalAccount(account);
      setError('');
      writeActivity({ type: 'signer', title: 'Signer externe connecté', detail: shorten(account) });
      setActivity(readJson(ACTIVITY_KEY, []));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (user) refreshMetaniWallet(preferredFiatCurrency).catch(() => {});
  }, [preferredFiatCurrency]);


  async function handleQrImageScan(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setQrScanMessage('Lecture du QR code...');
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imageData.data, imageData.width, imageData.height);
      if (!qr?.data) throw new Error('QR code non lisible. Essaie avec plus de lumière ou une image plus nette.');
      const parsed = parsePaymentQrPayload(qr.data);
      if (!parsed.address) throw new Error('Ce QR ne contient pas d’adresse wallet utilisable.');
      setRecipient(parsed.address);
      if (parsed.amount) setAmount(parsed.amount);
      setQrScanMessage(parsed.amount ? 'Adresse et montant récupérés depuis le QR.' : 'Adresse récupérée depuis le QR.');
    } catch (err) {
      setQrScanMessage('');
      setError(err.message || 'Scan QR impossible.');
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
      const token = localStorage.getItem(SSO_TOKEN_KEY) || localStorage.getItem(METANI_SHARED_SSO_TOKEN_KEY);
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

  async function submitInternalTransfer(event) {
    event.preventDefault();
    setError('');
    setTxHash('');
    setBankMessage('');
    if (!transferForm.to.trim() || !transferForm.amount || Number(transferForm.amount) <= 0) {
      setError('Destinataire et montant requis pour le virement.');
      return;
    }
    setBankLoading(true);
    try {
      const data = await bankRequest('/api/banks/me/transfer', {
        method: 'POST',
        body: JSON.stringify(transferForm),
      });
      if (data.success === false) throw new Error(data.error || 'Virement refusé.');
      setBankMessage(`Virement envoyé: ${data.transfer.amount} ${data.transfer.currency}`);
      setTransferForm({ to: '', amount: '', currency: transferForm.currency, memo: '' });
      writeActivity({ type: 'bank', title: 'Virement iTani Bank', detail: data.transfer.to?.user?.display_name || data.transfer.currency });
      setActivity(readJson(ACTIVITY_KEY, []));
      await refreshBankData();
    } catch (err) {
      setError(err.message || 'Virement impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function requestVirtualCard() {
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      await bankRequest('/api/banks/me/cards/virtual', { method: 'POST' });
      setBankMessage('Carte virtuelle iTani Bank active.');
      await refreshBankData();
    } catch (err) {
      setError(err.message || 'Carte virtuelle indisponible.');
    } finally {
      setBankLoading(false);
    }
  }


  function issuingPayload(type) {
    return {
      type,
      card_holder_name: cardAddress.full_name,
      shipping_service: issuingDesign.shipping_service,
      shipping_address: cardAddress,
      design: {
        label: issuingDesign.label,
        background_color: issuingDesign.background_color,
        accent_color: issuingDesign.accent_color,
        text_color: issuingDesign.text_color,
        logo_url: issuingDesign.logo_url,
        symbols: issuingDesign.symbols.split(',').map((item) => item.trim()).filter(Boolean),
        second_line: issuingDesign.second_line,
      },
    };
  }

  async function quoteIssuingCard(type = 'physical') {
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      const data = await bankRequest('/api/banks/me/issuing/cards/quote', {
        method: 'POST',
        body: JSON.stringify(issuingPayload(type)),
      });
      setIssuingQuote(data);
      setBankMessage('Devis ' + (type === 'physical' ? 'carte physique' : 'carte virtuelle') + ': ' + data.fee_quote.total + ' ' + data.fee_quote.currency);
    } catch (err) {
      setError(err.message || 'Devis carte impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function requestSheikPortraitPremium() {
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      const data = await bankRequest('/api/banks/me/sheiks/portrait-premium/request', {
        method: 'POST',
        body: JSON.stringify({ portrait_url: sheikPortraitUrl }),
      });
      setSheikPortraitPremium(data.portrait_premium);
      setBankMessage('Option portrait Sheik demandée: ' + data.payment_instructions.amount_eur + ' EUR · Référence ' + data.payment_instructions.reference);
    } catch (err) {
      setError(err.message || 'Demande portrait Sheik impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function updateSheikPortraitPremium() {
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      const data = await bankRequest('/api/banks/me/sheiks/portrait-premium/profile', {
        method: 'POST',
        body: JSON.stringify({ portrait_url: sheikPortraitUrl }),
      });
      setSheikPortraitPremium(data.portrait_premium);
      setBankMessage('Portrait personnalisé Sheik mis à jour.');
    } catch (err) {
      setError(err.message || 'Mise à jour portrait Sheik impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function createSheik(event) {
    event.preventDefault();
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      const data = await bankRequest('/api/banks/me/sheiks', {
        method: 'POST',
        body: JSON.stringify({ ...sheikForm, mood: sheikForm.mood, portrait_url: sheikPortraitPremium?.active ? sheikPortraitUrl || sheikPortraitPremium?.portrait_url : undefined }),
      });
      setSheikResult(data.sheik);
      setBankMessage('Sheik émis: ' + data.sheik.reference + ' | Code: ' + data.sheik.claim_code);
      writeActivity({ type: 'bank', title: 'Sheik émis', detail: data.sheik.reference });
      setActivity(readJson(ACTIVITY_KEY, []));
      await refreshBankData();
    } catch (err) {
      setError(err.message || 'Emission Sheik impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function requestSheikPrintPass(event) {
    event.preventDefault();
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      const sheikId = sheikRedeemForm.sheik_id || sheikResult?.id || sheikResult?.reference;
      if (!sheikId) throw new Error('Référence Sheik requise.');
      const data = await bankRequest('/api/banks/me/sheiks/' + encodeURIComponent(sheikId) + '/print-pass', {
        method: 'POST',
        body: JSON.stringify({ delivery_name: sheikRedeemForm.delivery_name, delivery_address: sheikRedeemForm.delivery_address }),
      });
      setSheikResult(data.sheik);
      setBankMessage('Impression Sheik demandée: ' + data.print_pass.format + ' · ' + data.print_pass.status);
      writeActivity({ type: 'bank', title: 'Impression Sheik demandée', detail: data.sheik.reference });
      setActivity(readJson(ACTIVITY_KEY, []));
    } catch (err) {
      setError(err.message || 'Demande impression Sheik impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function redeemSheik(event) {
    event.preventDefault();
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      const data = await bankRequest('/api/banks/me/sheiks/' + encodeURIComponent(sheikRedeemForm.sheik_id) + '/redeem', {
        method: 'POST',
        body: JSON.stringify({ claim_code: sheikRedeemForm.claim_code }),
      });
      setBankMessage('Sheik encaissé: ' + data.sheik.amount + ' ' + data.sheik.currency);
      writeActivity({ type: 'bank', title: 'Sheik encaissé', detail: data.sheik.reference });
      setActivity(readJson(ACTIVITY_KEY, []));
      await refreshBankData();
    } catch (err) {
      setError(err.message || 'Encaissement Sheik impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function requestInstallmentReactivation(event) {
    event.preventDefault();
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      const data = await bankRequest('/api/banks/me/installments/reactivation-request', {
        method: 'POST',
        body: JSON.stringify({
          monthly_due: installmentReactivationForm.monthly_due,
          payment_method: installmentReactivationForm.payment_method,
          crypto_asset: installmentReactivationForm.crypto_asset,
          reason: installmentReactivationForm.reason,
        }),
      });
      setBankMessage('Demande envoyée. Référence paiement: ' + data.payment_instructions.reference + ' | Total: ' + data.payment_instructions.amount_eur + ' EUR');
      writeActivity({ type: 'bank', title: 'Demande réactivation paiement différé', detail: data.payment_instructions.reference });
      setActivity(readJson(ACTIVITY_KEY, []));
    } catch (err) {
      setError(err.message || 'Demande de réactivation impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function issueExternalCard(type = 'virtual') {
    setError('');
    setBankMessage('');
    if (!canOrderIssuingCard) {
      setError(issuingBlockReason || 'Création carte indisponible pour ce compte.');
      return;
    }
    setBankLoading(true);
    try {
      const path = type === 'physical' ? '/api/banks/me/issuing/cards/physical' : '/api/banks/me/issuing/cards/virtual';
      const data = await bankRequest(path, {
        method: 'POST',
        body: JSON.stringify(issuingPayload(type)),
      });
      if (data.success === false) throw new Error(data.error || 'Emission Stripe Issuing refusée.');
      setBankMessage((type === 'physical' ? 'Carte physique' : 'Carte virtuelle') + ' Stripe Issuing créée: ' + data.card.status);
      writeActivity({ type: 'bank', title: type === 'physical' ? 'Carte physique Stripe demandée' : 'Carte virtuelle Stripe créée', detail: data.card.stripe_card_id });
      setActivity(readJson(ACTIVITY_KEY, []));
      await refreshBankData();
    } catch (err) {
      setError(err.message || 'Emission Stripe Issuing impossible.');
    } finally {
      setBankLoading(false);
    }
  }

  async function requestPhysicalCard(event) {
    event.preventDefault();
    setError('');
    setBankMessage('');
    setBankLoading(true);
    try {
      const data = await bankRequest('/api/banks/me/cards/physical', {
        method: 'POST',
        body: JSON.stringify({ shipping_address: cardAddress, card_holder_name: cardAddress.full_name }),
      });
      if (data.success === false) throw new Error(data.error || 'Demande de carte refusée.');
      setBankMessage(`Demande carte physique enregistrée: ${data.physical_card_order.status}`);
      writeActivity({ type: 'bank', title: 'Carte physique demandée', detail: data.physical_card_order.id });
      setActivity(readJson(ACTIVITY_KEY, []));
      await refreshBankData();
    } catch (err) {
      setError(err.message || 'Demande de carte physique impossible.');
    } finally {
      setBankLoading(false);
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
            <strong>iTani Kobs App</strong>
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
          <div className="dashboardGrid homeSummaryGrid">
            <section className="card heroCard wide dashboardIntro">
              <div>
                <p className="eyebrow">dApp officielle</p>
                <h2>Tableau de bord rapide</h2>
                <p>Les informations essentielles pour agir vite: solde, envoi, reception, wallet iTani et etat de la chaine.</p>
              </div>
              <div className="heroActions dashboardAutoActions">
                <div className="bankAutoSync" aria-live="polite">
                  {metaniWalletLoading ? <span><Loader2 className="spin" size={18} /> Synchronisation automatique</span> : <span>Synchronisation automatique active</span>}
                </div>
                <button className="secondaryAction" type="button" onClick={() => setActiveTab('portfolio')}>
                  Portfolio complet <Wallet size={18} />
                </button>
              </div>
            </section>

            <section className="balanceCard quickBalanceCard">
              <div className="balanceHeader">
                <span>Solde</span>
                <button className="iconButton subtle" type="button" onClick={() => setShowBalance(!showBalance)}>
                  {showBalance ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <strong>{showBalance ? officialItaniDisplay : '••••••'} <small>{officialItaniSymbol}</small></strong>
              <p>{shorten(walletAddress, 12, 10)} · {officialItaniSource}</p>
            </section>

            <section className="card dashboardCardPreview">
              <div className="dashboardCardTop">
                <span>CB principale</span>
                <div className="cardTopActions">
                  <button className="iconButton subtle" type="button" onClick={() => setShowCardSensitive(!showCardSensitive)} aria-label={showCardSensitive ? 'Masquer la carte' : 'Afficher temporairement la carte'}>
                    {showCardSensitive ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                  <CreditCard size={20} />
                </div>
              </div>
              <div className="dashboardCardFace stripeCardFace" aria-label="Carte principale iTani Pay">
                <div className="stripeCardBrand">
                  <span className="stripeCardChip" aria-hidden="true" />
                  <small>iTani Pay</small>
                </div>
                <button className="cardCopyHotspot cardNumberHotspot" type="button" onClick={() => copyCardField('Numéro carte', primaryCardFullNumber || maskedCardNumber(primaryCard))}>
                  <span>{primaryCardNumber}</span>
                  <small><Copy size={13} /> Copier numéro</small>
                </button>
                <div className="stripeCardMeta">
                  <button className="cardCopyHotspot" type="button" onClick={() => copyCardField('Expiration', primaryCardExpiry)}>
                    <span>EXP {primaryCardExpiryDisplay}</span>
                    <small><Copy size={13} /> Exp.</small>
                  </button>
                  <button className="cardCopyHotspot" type="button" onClick={() => copyCardField('CVC', primaryCardCvc)}>
                    <span>CVC {primaryCardCvcDisplay}</span>
                    <small><Copy size={13} /> CVC</small>
                  </button>
                  <b>{primaryCard.network || 'VISA'}</b>
                </div>
              </div>
              <div className="metric"><span>Statut</span><strong>{primaryCard.status || 'Non activée'}</strong></div>
              <button className="secondaryAction compact" type="button" onClick={() => setActiveTab('accounts')}>Gérer la carte <ChevronRight size={18} /></button>
            </section>

            <section className="card quickActionPanel">
              <h2>Envoyer / Recevoir</h2>
              <p>Actions directes sans passer par les menus complets.</p>
              <div className="dashboardActionGrid">
                <button type="button" onClick={() => setActiveTab('send')}><Send size={20} /> Envoyer</button>
                <button type="button" onClick={() => setActiveTab('receive')}><ArrowDownLeft size={20} /> Recevoir</button>
                <button type="button" onClick={copyAddress}><Copy size={20} /> Copier adresse</button>
                <button type="button" onClick={() => setActiveTab('accounts')}><Landmark size={20} /> Comptes</button>
              </div>
            </section>

            <section className="card quickWalletCard">
              <h2>Wallet iTani</h2>
              <div className="metric"><span>Metani ID</span><strong>{user.pseudo || user.username}</strong></div>
              <div className="metric"><span>Adresse</span><strong>{shorten(walletAddress, 14, 10)}</strong></div>
              <div className="metric"><span>Signer autorisé</span><strong>{externalAccount ? (externalAccount === walletAddress ? 'Metani interne' : shorten(externalAccount)) : 'Non connecté'}</strong></div>
              <button className="primaryAction compact" type="button" onClick={connectSigner}>{externalAccount ? 'Signer autorisé' : 'Connecter signer'}</button>
            </section>

            <section className="card quickChainCard">
              <h2>Chaîne</h2>
              <div className="metric"><span>Réseau</span><strong>{activeNetwork.chainName}</strong></div>
              <div className="metric"><span>Height</span><strong>{chainInfo?.height ?? '-'}</strong></div>
              <div className="metric"><span>Transactions</span><strong>{String(chainInfo?.total_transactions ?? '-')}</strong></div>
              <button className="secondaryAction compact" type="button" onClick={() => setActiveTab('explorer')}>Explorer <ExternalLink size={18} /></button>
            </section>

            <section className="card wide quickActivityCard">
              <h2>Activité récente</h2>
              <ActivityList items={activity.slice(0, 4)} />
            </section>
          </div>
        ) : null}

        {activeTab === 'portfolio' ? (
          <div className="dashboardGrid">
            <section className="balanceCard">
              <div className="balanceHeader"><span>Wallet ITANI</span><Wallet size={18} /></div>
              <strong>{showBalance ? officialItaniDisplay : '••••••'} <small>{officialItaniSymbol}</small></strong>
              <p>{walletAddress}</p>
              <p>{officialItaniSource}</p>
              <div className="quickActions">
                <button type="button" onClick={copyAddress}><Copy size={18} /> Copier</button>
                <button type="button" onClick={() => { refreshWalletData(); refreshMetaniWallet(); }}><RefreshCw size={18} /> Actualiser</button>
              </div>
            </section>
            <section className="card wide kobsCore">
              <div className="kobsCoreHeader">
                <div>
                  <p className="eyebrow">Portfolio multi-actifs</p>
                  <h2>Kobs agrège iTani, ArtLinks, Yumon et Besty</h2>
                  <p>Les soldes viennent du ledger iTani Pay, des soldes app et de la blockchain quand l’adresse est liée.</p>
                </div>
                <div className="currencyPicker">
                  <label>Devise</label>
                  <select value={preferredFiatCurrency} onChange={(event) => setPreferredFiatCurrency(event.target.value)}>
                    {FIAT_CHOICES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </div>
              </div>
              <MetaniAssetGrid assets={metaniAssets} wallet={metaniWallet} loading={metaniWalletLoading} error={metaniWalletError} />
              <form className="metaniSwapPanel" onSubmit={executeMetaniSwap}>
                <div>
                  <label>Depuis</label>
                  <select value={metaniSwapForm.from_asset} onChange={(event) => setMetaniSwapForm({ ...metaniSwapForm, from_asset: event.target.value })}>
                    <option value="ITANI">iTani · ï</option>
                    <option value="AR">Art Ring · Â</option>
                    <option value="YUM">Yumi · Ÿ</option>
                    <option value="BES">Besty · Be</option>
                    <option value="BTC">Bitcoin · BTC</option>
                  </select>
                </div>
                <div>
                  <label>Vers</label>
                  <select value={metaniSwapForm.to_asset} onChange={(event) => setMetaniSwapForm({ ...metaniSwapForm, to_asset: event.target.value })}>
                    <option value="ITANI">iTani · ï</option>
                    <option value="AR">Art Ring · Â</option>
                    <option value="YUM">Yumi · Ÿ</option>
                    <option value="BES">Besty · Be</option>
                    <option value="BTC">Bitcoin · BTC</option>
                  </select>
                </div>
                <div>
                  <label>Montant</label>
                  <input value={metaniSwapForm.amount} onChange={(event) => setMetaniSwapForm({ ...metaniSwapForm, amount: event.target.value })} inputMode="decimal" placeholder="0.000" />
                </div>
                <button className="primaryAction compact" type="submit" disabled={!metaniSwapForm.amount || metaniSwapForm.from_asset === metaniSwapForm.to_asset}>Swap</button>
                <p>Swap interne closed-loop via iTani Pay. Les échanges publics fiat/carte restent gardés par conformité KYC/AML et PSP.</p>
                {btcItaniBonus?.enabled ? (
                  <p className="btcBonusInline">Promo BTC → iTani: +{btcItaniBonus.percent ?? ((btcItaniBonus.bps || 0) / 100)}% en iTani bonus après confirmation réelle du swap.</p>
                ) : null}
              </form>
            </section>
            <section className="card">
              <h2>Données wallet</h2>
              <InfoRow label="Adresse" value={walletAddress} />
              <InfoRow label="Solde officiel Kobs" value={`${officialItaniDisplay} ${officialItaniSymbol}`} />
              <InfoRow label="Source solde" value={officialItaniSource} />
              <InfoRow label="Transactions envoyées" value={String(walletInfo?.tx_sent_count ?? walletInfo?.sent_count ?? '-')} />
              <InfoRow label="Transactions reçues" value={String(walletInfo?.tx_received_count ?? walletInfo?.received_count ?? '-')} />
            </section>
            <section className="card wide">
              <h2>Historique blockchain</h2>
              <ChainList items={addressHistory?.transactions || addressHistory?.history || []} empty="Aucune transaction trouvée pour ce wallet." />
            </section>
          </div>
        ) : null}

        {activeTab === 'accounts' ? (
          <div className="dashboardGrid accountsGrid">
            <section className="card heroCard wide">
              <div>
                <p className="eyebrow">iTani Bank</p>
                <h2>Comptes, virements et cartes</h2>
                <p>La consultation, les virements internes et les demandes de carte passent par iTani Pay Banks avec le SSO Metani.</p>
              </div>
              <div className="heroActions bankAutoSync" aria-live="polite">
                {bankLoading ? <span><Loader2 className="spin" size={18} /> Synchronisation automatique</span> : <span>Synchronisation automatique active</span>}
              </div>
            </section>

            {bankMessage ? <div className="alert success wide">{bankMessage}</div> : null}

            <section className="bankOverview wide" aria-label="Solde et cartes iTani Bank">
              <article className="bankSlide balanceSlide">
                <span>Solde principal global</span>
                <strong>{formatFiatAmount(globalFiatSummary.total, globalFiatSummary.currency)}</strong>
                <small>Banque {formatFiatAmount(globalFiatSummary.bankTotal, globalFiatSummary.currency)} · Crypto valorisee {formatFiatAmount(globalFiatSummary.cryptoTotal, globalFiatSummary.currency)}{globalFiatSummary.unpricedAssets ? ` · ${globalFiatSummary.unpricedAssets} actif(s) sans prix reel` : ''}</small>
              </article>
              <article className="bankSlide balanceSlide">
                <span>Solde crypto officiel</span>
                <strong>{officialItaniDisplay} <small>{officialItaniSymbol}</small></strong>
                <small>{officialItaniSource}</small>
              </article>
              <article className="bankSlide balanceSlide">
                <span>Solde bancaire interne</span>
                <strong>{formatFiatAmount(globalFiatSummary.bankTotal, globalFiatSummary.currency)}</strong>
                <small>{globalFiatSummary.currency} · Metani Bank closed-loop</small>
              </article>
              <article className="bankSlide virtualSlide">
                <span>CB virtuelle</span>
                <strong>{bankData?.account?.virtual_card?.status || 'À activer'}</strong>
                <small>{bankData?.account?.virtual_card?.card_number_masked || 'Demande instantanée'}</small>
              </article>
              <article className="bankSlide physicalSlide">
                <span>Carte physique</span>
                <strong>{issuingQuote?.fee_quote?.total ? `${issuingQuote.fee_quote.total} ${issuingQuote.fee_quote.currency}` : 'Sur devis'}</strong>
                <small>Design, impression, livraison</small>
              </article>
              {metaniAssets.filter((asset) => !['ITANI', 'ITN'].includes(String(asset.currency || '').toUpperCase())).map((asset) => (
                <article className="bankSlide" key={asset.key || asset.currency}>
                  <span>Solde {asset.symbol || asset.currency}</span>
                  <strong>{formatAssetBalance(asset.total_balance, asset.display_decimals)} <small>{asset.symbol || asset.currency}</small></strong>
                  <small>Ledger {formatAssetBalance(asset.wallet_balance, asset.display_decimals)} · App {formatAssetBalance(asset.app_balance, asset.display_decimals)} · Chain {formatAssetBalance(asset.onchain_balance, asset.display_decimals)}</small>
                </article>
              ))}
              {Object.entries(bankData?.balances || {}).filter(([currency]) => currency !== 'EUR').map(([currency, value]) => (
                <article className="bankSlide" key={`bank-${currency}`}>
                  <span>Solde bancaire {currency}</span>
                  <strong>{value}</strong>
                  <small>Compte financier Metani</small>
                </article>
              ))}
              <article className="bankSlide issuingSlide">
                <span>Carte iTani Issuing</span>
                <strong>{canOrderIssuingCard ? 'Prête' : kycApproved ? 'À finaliser' : 'KYC en attente'}</strong>
                <small>{issuingCards.length ? `${issuingCards.length} carte(s) liée(s)` : 'Workflow réutilisable pour chaque client Kobs'}</small>
              </article>
            </section>

            <section className="card wide bankGlossary" aria-label="Glossaire iTani Bank">
              {[
                { id: 'bank-export-metamask', label: 'Export MetaMask', icon: LockKeyhole },
                { id: 'bank-financial-account', label: 'Compte financier', icon: Landmark },
                { id: 'bank-balances-detail', label: 'Soldes détaillés', icon: Wallet },
                { id: 'bank-virtual-card', label: 'Carte virtuelle', icon: CreditCard },
                { id: 'bank-transfer', label: 'Virement interne', icon: ArrowUpRight },
                { id: 'bank-card-design', label: 'Design carte Stripe', icon: Palette, image: defaultItaniCardLogo },
                { id: 'bank-sheik', label: 'Sheik', icon: Sparkles },
                { id: 'bank-reactivation', label: 'Réactivation paiement différé', icon: RefreshCw },
                { id: 'bank-physical-card', label: 'Carte physique', icon: CreditCard },
                { id: 'bank-history', label: 'Historique compte', icon: History },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button className={`cubeIcon ${selectedBankTool === item.id ? 'active' : ''}`} type="button" key={item.id} onClick={() => setSelectedBankTool(item.id)} aria-pressed={selectedBankTool === item.id}>
                    <BankToolCube3D active={selectedBankTool === item.id} label={item.label}>
                      {item.image ? <img src={item.image} alt="" /> : <Icon size={28} />}
                    </BankToolCube3D>
                    <strong>{item.label}</strong>
                  </button>
                );
              })}
            </section>

            <div className="bankTooltipAnchor wide" aria-live="polite">
            {selectedBankTool === 'bank-export-metamask' ? (
            <section id="bank-export-metamask" className="card formCard wide bankFunction bankTooltipPanel">
              <h2>Export MetaMask</h2>
              <p>Affiche la clé privée uniquement dans Kobs, après mot de passe Metani. Elle n’est pas envoyée dans le chat, pas sauvegardée dans le navigateur, et disparaît automatiquement.</p>
              <form className="stackedForm" onSubmit={exportMetaniWallet}>
                <label>Mot de passe Metani</label>
                <input type="password" value={walletExportForm.password} onChange={(event) => setWalletExportForm({ ...walletExportForm, password: event.target.value })} placeholder="Mot de passe du compte" autoComplete="current-password" />
                <label className="checkLine">
                  <input type="checkbox" checked={walletExportForm.acknowledged} onChange={(event) => setWalletExportForm({ ...walletExportForm, acknowledged: event.target.checked })} />
                  <span>Je comprends que toute personne possédant cette clé peut contrôler le wallet.</span>
                </label>
                <button className="primaryAction" type="submit" disabled={walletExportLoading}>
                  {walletExportLoading ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />} Afficher la clé sécurisée
                </button>
              </form>
              {walletExportResult?.private_key ? (
                <div className="exportSecretBox">
                  <div className="metric"><span>Adresse</span><strong>{shorten(walletExportResult.evm_address || walletExportResult.address, 12, 10)}</strong></div>
                  <label>Clé privée</label>
                  <div className="secretReveal">
                    <input readOnly value={walletExportVisible ? walletExportResult.private_key : '•'.repeat(Math.min(64, walletExportResult.private_key.length))} />
                    <button type="button" onClick={() => setWalletExportVisible(!walletExportVisible)}>{walletExportVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                    <button type="button" onClick={copyExportedPrivateKey}><Copy size={17} /></button>
                  </div>
                  <small>{walletExportResult.warning || 'Importe cette clé uniquement dans ton wallet personnel.'}</small>
                  <small>Mnemonic: {walletExportResult.mnemonic_available ? 'disponible' : 'non stocké par Metani pour ce wallet'}</small>
                </div>
              ) : null}
            </section>

            ) : null}

            {selectedBankTool === 'bank-financial-account' ? (
            <section id="bank-financial-account" className="card bankFunction bankTooltipPanel">
              <h2>Compte financier</h2>
              <InfoRow label="Numéro" value={bankData?.account?.wallet?.internal_account_number || '-'} />
              <InfoRow label="IBAN interne" value={bankData?.account?.rib_reference?.iban_formatted || bankData?.account?.rib_reference?.iban || '-'} />
              <InfoRow label="RIB interne" value={bankData?.account?.rib_reference?.rib || bankData?.account?.rib_reference?.reference || '-'} />
              <InfoRow label="BIC/SWIFT" value={bankData?.account?.rib_reference?.bic || bankData?.account?.rib_reference?.swift || '-'} />
              <InfoRow label="Usage" value={bankData?.account?.rib_reference?.usage === 'internal_metani_bank_wallet_transfers_only' || bankData?.account?.rib_reference?.iban_scope?.includes('metani_internal') ? 'Compte bancaire interne Metani WW - non SEPA/SWIFT externe tant que EMI ou banque partenaire n\'a pas emis un vrai IBAN' : (bankData?.account?.rib_reference?.status || '-')} />
              <InfoRow label="KYC" value={bankData?.account?.user?.kyc_status || '-'} />
            </section>

            ) : null}

            {selectedBankTool === 'bank-balances-detail' ? (
            <section id="bank-balances-detail" className="card bankFunction bankBalancesDetail bankTooltipPanel">
              <h2>Soldes détaillés</h2>
              {Object.entries(bankData?.balances || {}).length ? Object.entries(bankData.balances).map(([currency, value]) => (
                <div className="metric" key={currency}><span>{currency}</span><strong>{value}</strong></div>
              )) : <div className="emptyState compact"><Wallet size={24} /><strong>Aucun solde bancaire interne.</strong></div>}
            </section>

            ) : null}

            {selectedBankTool === 'bank-virtual-card' ? (
            <section id="bank-virtual-card" className="card bankFunction bankTooltipPanel">
              <h2>Carte virtuelle</h2>
              <InfoRow label="Statut" value={primaryCard.status || '-'} />
              <InfoRow label="Réseau" value={primaryCard.network || '-'} />
              <InfoRow label="Carte" value={primaryCardNumber || '-'} />
              <InfoRow label="Expiration" value={primaryCardExpiryDisplay} />
              <InfoRow label="CVC" value={primaryCardCvcDisplay} />
              <div className="cardCopyGrid compact">
                <button type="button" onClick={() => setShowCardSensitive(!showCardSensitive)}>{showCardSensitive ? <EyeOff size={15} /> : <Eye size={15} />} {showCardSensitive ? 'Masquer' : 'Afficher 30s'}</button>
                <button type="button" onClick={() => copyCardField('Numéro carte', primaryCardFullNumber || maskedCardNumber(primaryCard))}><Copy size={15} /> Copier numéro</button>
                <button type="button" onClick={() => copyCardField('Expiration', primaryCardExpiry)}><Copy size={15} /> Copier exp.</button>
                <button type="button" onClick={() => copyCardField('CVC', primaryCardCvc)}><Copy size={15} /> Copier CVC</button>
              </div>
              <button className="primaryAction compact" type="button" onClick={requestVirtualCard} disabled={bankLoading}>
                <CreditCard size={18} /> Activer
              </button>
            </section>

            ) : null}

            {selectedBankTool === 'bank-transfer' ? (
            <section id="bank-transfer" className="card formCard bankFunction bankTooltipPanel">
              <h2>Virement interne</h2>
              <form onSubmit={submitInternalTransfer}>
                <label>Compte, RIB, wallet ou email destinataire</label>
                <input value={transferForm.to} onChange={(event) => setTransferForm({ ...transferForm, to: event.target.value })} placeholder="ITP..., ITANI-..., wallet ou email" />
                <label>Montant</label>
                <div className="amountInput">
                  <input value={transferForm.amount} onChange={(event) => setTransferForm({ ...transferForm, amount: event.target.value })} inputMode="decimal" placeholder="0.00" />
                  <span>{transferForm.currency}</span>
                </div>
                <label>Devise</label>
                <input value={transferForm.currency} onChange={(event) => setTransferForm({ ...transferForm, currency: event.target.value.toUpperCase() })} placeholder="EUR" />
                <label>Mémo</label>
                <input value={transferForm.memo} onChange={(event) => setTransferForm({ ...transferForm, memo: event.target.value })} placeholder="Optionnel" />
                <button className="primaryAction" type="submit" disabled={bankLoading}>Envoyer le virement <ArrowUpRight size={18} /></button>
              </form>
            </section>

            ) : null}

            {selectedBankTool === 'bank-card-design' ? (
            <section id="bank-card-design" className="card formCard wide bankFunction bankTooltipPanel">
              <h2>Design carte Stripe</h2>
              <div className="issuingWorkflow" aria-label="Parcours carte iTani">
                <div>
                  <p className="eyebrow">Parcours carte iTani</p>
                  <h3>KYC → titulaire → devis → carte → autorisations</h3>
                  <p>Ce schéma sera répété pour chaque utilisateur Kobs. La carte n’est créée qu’après KYC validé et titulaire Issuing lié.</p>
                </div>
                <div className="workflowSteps">
                  {cardWorkflowSteps.map((step, index) => (
                    <div className={`workflowStep ${step.state}`} key={step.label}>
                      <span>{index + 1}</span>
                      <strong>{step.label}</strong>
                      <small>{step.detail}</small>
                    </div>
                  ))}
                </div>
                {issuingBlockReason ? <div className="alert warning compact">{issuingBlockReason}</div> : <div className="alert success compact">Parcours carte prêt pour ce compte.</div>}
                {issuingCards.length ? (
                  <div className="issuedCardsList">
                    {issuingCards.slice(0, 4).map((card) => (
                      <div key={card.stripe_card_id || card.id}>
                        <span>{card.type || 'card'} · {card.status || '-'}</span>
                        <strong>{card.last4 ? `•••• ${card.last4}` : shorten(card.stripe_card_id || card.id, 10, 6)}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="cardDesigner">
                <div className="cardPreview" style={{ background: issuingDesign.background_color, color: issuingDesign.text_color }}>
                  <div className="cardPreviewGlow" style={{ background: issuingDesign.accent_color }} />
                  <div className="cardPreviewTop">
                    <img className="itaniCardLogo" src={issuingDesign.logo_url || defaultItaniCardLogo} alt="Logo iTani" />
                    <strong>{issuingDesign.label}</strong>
                  </div>
                  <div className="cardPreviewMark">•••• •••• •••• 4242</div>
                  <div className="cardPreviewSymbols">
                    {issuingDesign.symbols.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 6).map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <div className="cardPreviewBottom"><small>{issuingDesign.second_line}</small><b>VISA</b></div>
                </div>
                <div className="designFields">
                  <label>Nom affiché</label>
                  <input value={issuingDesign.label} onChange={(event) => setIssuingDesign({ ...issuingDesign, label: event.target.value })} placeholder="iTani Card" />
                  <label>Logo URL</label>
                  <input value={issuingDesign.logo_url} onChange={(event) => setIssuingDesign({ ...issuingDesign, logo_url: event.target.value })} placeholder="/itani-card-logo.jpg" />
                  <label>Ligne carte physique</label>
                  <input value={issuingDesign.second_line} onChange={(event) => setIssuingDesign({ ...issuingDesign, second_line: event.target.value.slice(0, 24) })} placeholder="iTani Pay" />
                  <label>Symboles</label>
                  <input value={issuingDesign.symbols} onChange={(event) => setIssuingDesign({ ...issuingDesign, symbols: event.target.value })} placeholder="∞, €, ★" />
                  <div className="formSplit">
                    <label>Fond<input type="color" value={issuingDesign.background_color} onChange={(event) => setIssuingDesign({ ...issuingDesign, background_color: event.target.value })} /></label>
                    <label>Accent<input type="color" value={issuingDesign.accent_color} onChange={(event) => setIssuingDesign({ ...issuingDesign, accent_color: event.target.value })} /></label>
                  </div>
                  <div className="formSplit">
                    <label>Texte<input type="color" value={issuingDesign.text_color} onChange={(event) => setIssuingDesign({ ...issuingDesign, text_color: event.target.value })} /></label>
                    <label>Livraison<input value={issuingDesign.shipping_service} onChange={(event) => setIssuingDesign({ ...issuingDesign, shipping_service: event.target.value.toLowerCase() })} placeholder="standard ou express" /></label>
                  </div>
                  {issuingQuote?.fee_quote ? <div className="ratePanel"><span>Total estimé</span><strong>{issuingQuote.fee_quote.total} {issuingQuote.fee_quote.currency}</strong>{issuingQuote.fee_quote.lines?.map((line) => <small key={line.code}>{line.label}: {line.amount} {line.currency}</small>)}</div> : null}
                  <div className="quickActions">
                    <button type="button" onClick={() => quoteIssuingCard('physical')} disabled={bankLoading}><CreditCard size={18} /> Devis physique</button>
                    <button type="button" onClick={() => issueExternalCard('virtual')} disabled={bankLoading || !canOrderIssuingCard} title={issuingBlockReason || 'Créer une carte virtuelle'}><CreditCard size={18} /> Créer virtuelle</button>
                    <button type="button" onClick={() => issueExternalCard('physical')} disabled={bankLoading || !canOrderIssuingCard} title={issuingBlockReason || 'Commander une carte physique'}><CreditCard size={18} /> Commander physique</button>
                  </div>
                </div>
              </div>
            </section>

            ) : null}

            {selectedBankTool === 'bank-sheik' ? (
            <section id="bank-sheik" className="card formCard wide bankFunction bankTooltipPanel">
              <h2>Sheik</h2>
              <div className="sheikLayout">
                <div className={'sheikBanknote mood-' + (sheikForm.mood || sheikResult?.mood || 'rainbow')}>
                  <div className="sheikWatermark">iTani</div>
                  <div className="sheikSerial">{sheikResult?.token?.token_id || sheikResult?.reference || 'SHEIK-TOKEN'}</div>
                  <div className="sheikAmount"><span>{sheikForm.amount || sheikResult?.amount || '0.00'}</span><b>{sheikForm.currency || sheikResult?.currency || 'EUR'}</b></div>
                  <div className="sheikPortrait"><img src={sheikPortraitUrl || sheikPortraitPremium?.portrait_url || sheikResult?.portrait_url || '/sheik-portrait.jpg'} alt="Portrait Sheik" /></div>
                  <div className="sheikArboreal" />
                  <div className="sheikSeal">∞</div>
                  <div className="sheikFooter"><span>{sheikForm.beneficiary_name || sheikResult?.beneficiary_name || 'Bénéficiaire'}</span><strong>AUCUNE EXPIRATION</strong></div>
                </div>
                <div className="sheikMoodPanel">
                  <label>Mood univers</label>
                  <div className="moodGrid">
                    {sheikMoods.map((mood) => <button className={sheikForm.mood === mood.id ? 'active' : ''} type="button" key={mood.id} onClick={() => setSheikForm({ ...sheikForm, mood: mood.id })}>{mood.label}</button>)}
                  </div>
                </div>
                <form className="stackedForm" onSubmit={createSheik}>
                  <label>Montant retenu</label>
                  <div className="amountInput">
                    <input value={sheikForm.amount} onChange={(event) => setSheikForm({ ...sheikForm, amount: event.target.value })} inputMode="decimal" placeholder="0.00" />
                    <span>{sheikForm.currency}</span>
                  </div>
                  <label>Devise</label>
                  <input value={sheikForm.currency} onChange={(event) => setSheikForm({ ...sheikForm, currency: event.target.value.toUpperCase() })} placeholder="EUR" />
                  <label>Bénéficiaire email</label>
                  <input value={sheikForm.beneficiary_email} onChange={(event) => setSheikForm({ ...sheikForm, beneficiary_email: event.target.value })} placeholder="beneficiaire@email.com" />
                  <label>Nom bénéficiaire</label>
                  <input value={sheikForm.beneficiary_name} onChange={(event) => setSheikForm({ ...sheikForm, beneficiary_name: event.target.value })} placeholder="Nom ou enfant" />
                  <label>Date d’encaissement</label>
                  <input type="datetime-local" value={sheikForm.available_at} onChange={(event) => setSheikForm({ ...sheikForm, available_at: event.target.value })} />
                  <label>Message</label>
                  <textarea value={sheikForm.memo} onChange={(event) => setSheikForm({ ...sheikForm, memo: event.target.value })} placeholder="Cadeau différé, majorité, attente d’encaissement..." />
                  <label>Tête personnalisée</label>
                  <input value={sheikPortraitUrl} onChange={(event) => setSheikPortraitUrl(event.target.value)} placeholder="https://.../portrait.jpg" />
                  <div className="ratePanel"><span>Option portrait</span><strong>{sheikPortraitPremium?.active ? 'ACTIVE' : '1987 EUR'}</strong><small>Payable une seule fois pour tous les Sheik futurs.</small></div>
                  <div className="quickActions">
                    <button type="button" onClick={requestSheikPortraitPremium} disabled={bankLoading || sheikPortraitPremium?.active}>Demander l’option</button>
                    <button type="button" onClick={updateSheikPortraitPremium} disabled={bankLoading || !sheikPortraitPremium?.active}>Mettre à jour</button>
                  </div>
                  <button className="primaryAction" type="submit" disabled={bankLoading}>Émettre le Sheik <Landmark size={18} /></button>
                </form>
                <form className="stackedForm" onSubmit={redeemSheik}>
                  <label>Référence ou ID Sheik</label>
                  <input value={sheikRedeemForm.sheik_id} onChange={(event) => setSheikRedeemForm({ ...sheikRedeemForm, sheik_id: event.target.value })} placeholder="SHEIK-..." />
                  <label>Code d’encaissement</label>
                  <input value={sheikRedeemForm.claim_code} onChange={(event) => setSheikRedeemForm({ ...sheikRedeemForm, claim_code: event.target.value.toUpperCase() })} placeholder="Code secret" />
                  <label>Nom livraison impression</label>
                  <input value={sheikRedeemForm.delivery_name} onChange={(event) => setSheikRedeemForm({ ...sheikRedeemForm, delivery_name: event.target.value })} placeholder="Nom complet" />
                  <label>Adresse livraison impression</label>
                  <textarea value={sheikRedeemForm.delivery_address} onChange={(event) => setSheikRedeemForm({ ...sheikRedeemForm, delivery_address: event.target.value })} placeholder="Adresse pour papier plastifié souple" />
                  {sheikResult ? <div className="ratePanel"><span>Code à transmettre</span><strong>{sheikResult.claim_code}</strong><small>{sheikResult.reference} · disponible le {new Date(sheikResult.available_at).toLocaleString()}</small><small>Token NFT: {sheikResult.token?.token_id || '-'} · {sheikResult.token?.status || 'tokenisé'}</small></div> : null}
                  <div className="quickActions">
                    <button type="button" onClick={requestSheikPrintPass} disabled={bankLoading}>Imprimer plastifié</button>
                    <button className="primaryAction" type="submit" disabled={bankLoading}>Encaisser le Sheik <ArrowDownLeft size={18} /></button>
                  </div>
                </form>
              </div>
            </section>

            ) : null}

            {selectedBankTool === 'bank-reactivation' ? (
            <section id="bank-reactivation" className="card formCard wide bankFunction bankTooltipPanel">
              <h2>Réactivation paiement différé</h2>
              <form className="stackedForm" onSubmit={requestInstallmentReactivation}>
                <label>Mensualité due à payer comptant</label>
                <div className="amountInput">
                  <input value={installmentReactivationForm.monthly_due} onChange={(event) => setInstallmentReactivationForm({ ...installmentReactivationForm, monthly_due: event.target.value })} inputMode="decimal" placeholder="0.00" />
                  <span>EUR</span>
                </div>
                <label>Moyen de paiement</label>
                <select value={installmentReactivationForm.payment_method} onChange={(event) => setInstallmentReactivationForm({ ...installmentReactivationForm, payment_method: event.target.value })}>
                  <option value="card">CB</option>
                  <option value="crypto">Crypto hors iTani</option>
                </select>
                {installmentReactivationForm.payment_method === 'crypto' ? <>
                  <label>Crypto</label>
                  <select value={installmentReactivationForm.crypto_asset} onChange={(event) => setInstallmentReactivationForm({ ...installmentReactivationForm, crypto_asset: event.target.value })}>
                    <option value="BTC">BTC</option>
                    <option value="ETH">ETH</option>
                    <option value="USDT">USDT</option>
                  </select>
                </> : null}
                <label>Message</label>
                <textarea value={installmentReactivationForm.reason} onChange={(event) => setInstallmentReactivationForm({ ...installmentReactivationForm, reason: event.target.value })} placeholder="Expliquez brièvement l’incident et votre demande" />
                <div className="ratePanel"><span>Frais réactivation</span><strong>1000 EUR</strong><small>Après validation du paiement comptant, l’ancienne carte est remplacée et le droit peut être rétabli avec majoration.</small></div>
                <button className="primaryAction" type="submit" disabled={bankLoading}>Demander la réactivation <ArrowUpRight size={18} /></button>
              </form>
            </section>

            ) : null}

            {selectedBankTool === 'bank-physical-card' ? (
            <section id="bank-physical-card" className="card formCard bankFunction bankTooltipPanel">
              <h2>Carte physique</h2>
              <form onSubmit={requestPhysicalCard}>
                <label>Nom du porteur</label>
                <input value={cardAddress.full_name} onChange={(event) => setCardAddress({ ...cardAddress, full_name: event.target.value })} placeholder="Nom complet" />
                <label>Adresse</label>
                <input value={cardAddress.line1} onChange={(event) => setCardAddress({ ...cardAddress, line1: event.target.value })} placeholder="Adresse" />
                <input value={cardAddress.line2} onChange={(event) => setCardAddress({ ...cardAddress, line2: event.target.value })} placeholder="Complément" />
                <div className="formSplit">
                  <input value={cardAddress.postal_code} onChange={(event) => setCardAddress({ ...cardAddress, postal_code: event.target.value })} placeholder="Code postal" />
                  <input value={cardAddress.city} onChange={(event) => setCardAddress({ ...cardAddress, city: event.target.value })} placeholder="Ville" />
                </div>
                <div className="formSplit">
                  <input value={cardAddress.country} onChange={(event) => setCardAddress({ ...cardAddress, country: event.target.value.toUpperCase() })} placeholder="FR" />
                  <input value={cardAddress.phone} onChange={(event) => setCardAddress({ ...cardAddress, phone: event.target.value })} placeholder="Téléphone" />
                </div>
                <button className="primaryAction" type="submit" disabled={bankLoading}>Demander la carte <CreditCard size={18} /></button>
              </form>
            </section>

            ) : null}

            {selectedBankTool === 'bank-history' ? (
            <section id="bank-history" className="card wide bankHistory bankTooltipPanel">
              <h2>Historique compte</h2>
              <ChainList items={bankData?.statement || []} empty="Aucune opération bancaire interne." />
            </section>
            ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'send' ? (
          <section className="card formCard">
            <h2>Envoyer ITANI</h2>
            <p>La transaction est préparée ici et signée dans ton wallet externe.</p>
            <form onSubmit={sendItani}>
              <div className="labelLine">
                <label>Adresse destinataire</label>
                <button className="secondaryAction mini" type="button" onClick={() => qrFileInputRef.current?.click()}>
                  <Camera size={17} /> Scanner QR
                </button>
              </div>
              <input ref={qrFileInputRef} className="srOnly" type="file" accept="image/*" capture="environment" onChange={handleQrImageScan} />
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="0x... ou iT..." />
              {qrScanMessage ? <small className="formHint success">{qrScanMessage}</small> : null}
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
            <div className="qrMock" aria-label={`QR code de réception ${walletAddress || 'wallet non lié'}`}>
              {receiveQrSvg ? (
                <div className="qrSvg" dangerouslySetInnerHTML={{ __html: receiveQrSvg }} />
              ) : (
                <Wallet size={54} />
              )}
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
            {btcItaniBonus?.enabled ? (
              <div className="btcBonusCard">
                <strong>{btcItaniBonus.label || 'Offre BTC vers iTani'}</strong>
                <span>Les clients qui mergent ou swappent du BTC vers iTani reçoivent +{btcItaniBonus.percent ?? ((btcItaniBonus.bps || 0) / 100)}% en iTani bonus, uniquement après confirmation réelle et écriture ledger.</span>
              </div>
            ) : null}
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

function MetaniAssetGrid({ assets, wallet, loading, error }) {
  if (loading) {
    return <div className="emptyState compact"><Loader2 className="spin" size={24} /><strong>Synchronisation du portefeuille Metani...</strong></div>;
  }
  if (error) {
    return <div className="emptyState compact"><Wallet size={24} /><strong>Portefeuille Metani non chargé</strong><small>{error}</small></div>;
  }
  if (!assets?.length) {
    return <div className="emptyState compact"><Wallet size={24} /><strong>Aucun actif Metani chargé.</strong><small>Relance Synchroniser. Si la session a expiré, reconnecte-toi via Metani ID.</small></div>;
  }
  return (
    <div className="assetGrid">
      {assets.map((asset) => (
        <article className={asset.active_in_current_app ? 'assetCard active' : 'assetCard'} key={asset.currency}>
          <div className="assetHeader">
            <span>{asset.code || asset.currency}</span>
            <b>{asset.symbol}</b>
          </div>
          <strong>{formatAssetBalance(asset.total_balance, asset.display_decimals)} {asset.symbol}</strong>
          <small>{asset.name} · {asset.network_code || asset.currency}</small>
          <div className="assetFiat">
            <span>Prix pays: {formatFiatQuote(asset.fiat_local)}</span>
            <span>Prix reel: {formatFiatQuote(asset.fiat_preferred)}</span>
          </div>
          <div className="assetSources">
            <span>Ledger {formatAssetBalance(asset.wallet_balance, asset.display_decimals)}</span>
            <span>App {formatAssetBalance(asset.app_balance, asset.display_decimals)}</span>
            <span className={asset.onchain?.available ? 'online' : ''}>Chain {formatAssetBalance(asset.onchain_balance, asset.display_decimals)}</span>
          </div>
        </article>
      ))}
      <article className="assetCard networkCard">
        <div className="assetHeader"><span>Réseau</span><b><Globe2 size={18} /></b></div>
        <strong>{wallet?.blockchain?.source === 'itani_network_chain_public_node' ? 'Connecté' : 'Lecture'}</strong>
        <small>{wallet?.blockchain?.address ? shorten(wallet.blockchain.address, 12, 10) : 'Adresse à lier'}</small>
        <div className="assetFiat"><span>{wallet?.fiat?.source || 'real_market_rates_only_no_internal_indicative_quotes'}</span></div>
      </article>
    </div>
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
