(function () {
  const VERSION = '2026-05-09';
  const KEY = 'itani_consent_v1';
  const COOKIE = 'itani_consent';
  const DOMAIN = '.itaninetworkchain.com';
  const LEGAL_URL = 'https://myelbox.itaninetworkchain.com/legal.html';
  const REQUIRED_DELAY = 21;

  function savedConsent() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (value && value.version === VERSION && value.required === true) return true;
    } catch {
      // Continue with cookie fallback.
    }
    try {
      const cookie = document.cookie
        .split(';')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(`${COOKIE}=`));
      if (!cookie) return false;
      const value = JSON.parse(decodeURIComponent(cookie.slice(COOKIE.length + 1)));
      return value && value.version === VERSION && value.required === true;
    } catch {
      return false;
    }
  }

  function persistConsent(options) {
    const payload = {
      version: VERSION,
      company: 'iTani',
      siret: '94468636900017',
      required: true,
      analytics: Boolean(options.analytics),
      marketing: Boolean(options.marketing),
      ecosystem_traceability: Boolean(options.traceability),
      accepted_at: new Date().toISOString(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(payload));
    } catch {}
    try {
      document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(payload))}; Max-Age=31536000; Path=/; Domain=${DOMAIN}; Secure; SameSite=Lax`;
    } catch {}
    document.documentElement.classList.remove('itani-consent-locked');
    document.body?.classList.remove('itani-consent-locked');
    document.getElementById('itani-consent-gate')?.remove();
  }

  function injectStyles() {
    if (document.getElementById('itani-consent-styles')) return;
    const style = document.createElement('style');
    style.id = 'itani-consent-styles';
    style.textContent = `
      html.itani-consent-locked body > *:not(#itani-consent-gate),
      body.itani-consent-locked > *:not(#itani-consent-gate) {
        filter: blur(6px);
        pointer-events: none;
        user-select: none;
      }
      #itani-consent-gate {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        overflow: auto;
        background: rgba(2, 6, 23, 0.72);
        color: #f8fafc;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        isolation: isolate;
        opacity: 1 !important;
        pointer-events: auto !important;
        visibility: visible !important;
      }
      #itani-consent-gate .itani-consent-panel {
        width: min(760px, 100%);
        max-height: min(88dvh, 760px);
        overflow: auto;
        border: 1px solid rgba(148, 163, 184, 0.32);
        border-radius: 8px;
        background: #07111f;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        padding: 22px;
      }
      #itani-consent-gate h2 {
        margin: 0 0 10px;
        font-size: 22px;
        line-height: 1.2;
      }
      #itani-consent-gate p, #itani-consent-gate li {
        color: #cbd5e1;
        line-height: 1.5;
        font-size: 14px;
      }
      #itani-consent-gate ul {
        margin: 12px 0;
        padding-left: 20px;
      }
      #itani-consent-gate .itani-consent-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
        position: sticky;
        bottom: -22px;
        background: linear-gradient(180deg, rgba(7, 17, 31, 0.86), #07111f 34%);
        padding-top: 12px;
      }
      #itani-consent-gate button, #itani-consent-gate a.itani-consent-link {
        min-height: 42px;
        border-radius: 6px;
        border: 1px solid rgba(148, 163, 184, 0.35);
        padding: 0 14px;
        background: #0f172a;
        color: #f8fafc;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
      }
      #itani-consent-gate button[data-primary="true"] {
        border-color: #22d3ee;
        background: #0891b2;
      }
      #itani-consent-gate .itani-consent-small {
        font-size: 12px;
        color: #94a3b8;
      }
      @media (max-width: 560px) {
        #itani-consent-gate {
          align-items: stretch;
          padding: 10px;
        }
        #itani-consent-gate .itani-consent-panel {
          max-height: calc(100dvh - 20px);
          padding: 16px;
        }
        #itani-consent-gate .itani-consent-actions {
          display: grid;
        }
        #itani-consent-gate button,
        #itani-consent-gate a.itani-consent-link {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function showGate() {
    if (document.getElementById('itani-consent-gate')) return;
    injectStyles();
    document.documentElement.classList.add('itani-consent-locked');
    document.body?.classList.add('itani-consent-locked');
    const gate = document.createElement('div');
    gate.id = 'itani-consent-gate';
    gate.innerHTML = `
      <section class="itani-consent-panel" role="dialog" aria-modal="true" aria-labelledby="itani-consent-title">
        <h2 id="itani-consent-title">Conditions iTani Network Chain</h2>
        <p>
          iTani, SIRET 94468636900017, demande ton accord avant l'acces libre aux services HudLife,
          HudWorld, ArtLinks et MyelBox. Les cookies essentiels, la securite, la prevention de fraude,
          les journaux techniques et la tracabilite de session sont necessaires au fonctionnement de
          l'ecosysteme.
        </p>
        <ul>
          <li>Les donnees de compte, pseudo, adresse blockchain, session, appareil, usage et habitudes de navigation peuvent etre traitees pour securite, support, notifications, conformite, amelioration produit et communication officielle iTani.</li>
          <li>Les traitements non essentiels, notamment mesure d'audience avancee et promotions personnalisees, peuvent etre refuses sans bloquer l'acces aux fonctions essentielles.</li>
          <li>Chaque utilisateur reste responsable de ses actions, de ses wallets, de ses cles et de toute manipulation frauduleuse. iTani se reserve le droit de suspendre, tracer et transmettre les elements utiles aux autorites competentes dans la limite du droit applicable.</li>
          <li>Aucune clause ne retire les droits obligatoires prevus par le RGPD, la loi locale applicable ou une decision d'autorite competente. La version francaise fait reference en cas d'ecart de traduction.</li>
        </ul>
        <p class="itani-consent-small" id="itani-consent-countdown">
          Tu disposes de ${REQUIRED_DELAY} secondes pour lire. Ensuite la page reste floutee jusqu'a ton choix.
        </p>
        <div class="itani-consent-actions">
          <button type="button" data-choice="all" data-primary="true">Accepter tout et acceder</button>
          <button type="button" data-choice="required">Cookies necessaires uniquement</button>
          <a class="itani-consent-link" href="${LEGAL_URL}" target="_blank" rel="noopener">Chartes et politiques</a>
        </div>
      </section>
    `;
    document.body.appendChild(gate);
    window.setTimeout(() => gate.querySelector('button[data-primary="true"]')?.focus(), 0);

    let remaining = REQUIRED_DELAY;
    const countdown = gate.querySelector('#itani-consent-countdown');
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        countdown.textContent = `Tu disposes de ${remaining} secondes pour lire. Ensuite la page reste floutee jusqu'a ton choix.`;
        return;
      }
      window.clearInterval(timer);
      countdown.textContent = "Lecture terminee: choisis une option pour deverrouiller l'application.";
    }, 1000);

    gate.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-choice]');
      if (!button) return;
      const all = button.dataset.choice === 'all';
      persistConsent({
        analytics: all,
        marketing: all,
        traceability: true,
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!savedConsent()) showGate();
    });
  } else if (!savedConsent()) {
    showGate();
  }
})();
