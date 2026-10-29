import Script from "next/script";

export const metadata = {
  title: "Application Validation and Compliance Portal | AICTE",
  description:
    "Portal for validation of AICTE Extension of Approval applications: document checks at upload, source verification, faculty and finance tests, room measurement and cross-college reuse detection.",
};

export const viewport = { width: "device-width", initialScale: 1 };

/* GOV-3 government portal shell (DBIM v3.0 / GIGW 3.0 pattern), rendered
   once on the server. The application views mount into #main-content via
   /app.js, exactly as on the classic portal pages. Inline handlers call
   window.A, defined by that script. */
const SHELL_TOP = `
<a class="skip-link" href="#main-content" data-i18n="skip">Skip to main content</a>

<div class="tricolour" aria-hidden="true"><span class="tc-saffron"></span><span class="tc-white"></span><span class="tc-green"></span></div>

<div class="utility-bar">
  <div class="wrap utility-in">
    <span class="gov-line"><span lang="hi">भारत सरकार</span> | Government of India</span>
    <span class="util-sep" aria-hidden="true">|</span>
    <span class="gov-line gov-line-2"><span lang="hi">शिक्षा मंत्रालय</span> | Ministry of Education</span>
    <span class="util-sep" aria-hidden="true">|</span>
    <a class="util-link" href="#main-content" data-i18n="skip">Skip to main content</a>
    <div class="util-controls" role="group" aria-label="Accessibility and language controls">
      <span class="util-group" role="group" aria-label="Language">
        <button type="button" class="util-btn" id="lang-hi" onclick="A.setLang('hi')" aria-pressed="false" title="हिन्दी में देखें">अ</button>
        <span aria-hidden="true">|</span>
        <button type="button" class="util-btn" id="lang-en" onclick="A.setLang('en')" aria-pressed="true" title="View in English">A</button>
      </span>
      <span class="util-group" role="group" aria-label="Text size">
        <button type="button" class="util-btn" onclick="A.setFont('small')" title="Decrease text size">A-</button>
        <button type="button" class="util-btn" onclick="A.setFont('normal')" title="Normal text size">A</button>
        <button type="button" class="util-btn" onclick="A.setFont('large')" title="Increase text size">A+</button>
      </span>
      <button type="button" class="util-btn" id="contrast-btn" onclick="A.toggleContrast()" aria-pressed="false" data-i18n="contrast">High Contrast</button>
      <button type="button" class="util-btn" onclick="A.info('screenReader')" data-i18n="screenReader">Screen Reader Access</button>
    </div>
  </div>
</div>

<header class="gov-header">
  <div class="wrap gov-in">
    <div class="lockup">
      <span class="emblem-slot" role="img" aria-label="Identity mark of the portal" title="Identity mark of the portal">
        <svg viewBox="0 0 48 48" width="52" height="52" aria-hidden="true" focusable="false">
          <rect x="7" y="5" width="34" height="3" fill="currentColor"/>
          <rect x="10" y="11" width="4" height="22" fill="currentColor"/>
          <rect x="22" y="11" width="4" height="22" fill="currentColor"/>
          <rect x="34" y="11" width="4" height="22" fill="currentColor"/>
          <rect x="7" y="36" width="34" height="3" fill="currentColor"/>
          <rect x="5" y="42" width="38" height="2" fill="currentColor"/>
        </svg>
      </span>
      <span class="lockup-text">
        <span class="lockup-hi" lang="hi">अखिल भारतीय तकनीकी शिक्षा परिषद</span>
        <span class="lockup-en">ALL INDIA COUNCIL FOR TECHNICAL EDUCATION</span>
        <span class="lockup-sub"><span lang="hi">आवेदन सत्यापन एवं अनुपालन पोर्टल</span> | Application Validation and Compliance Portal</span>
      </span>
    </div>
    <div class="gov-right">
      <div class="gov-badges" aria-hidden="true">
        <div class="badge-box badge-di"><span class="badge-dots"><i class="d-s"></i><i class="d-w"></i><i class="d-g"></i></span><span><b>Digital India</b><small>Power To Empower</small></span></div>
        <div class="badge-box badge-sih"><span><b>EoA 2027–28</b><small>Renewal window open</small></span></div>
      </div>
      <form class="site-search" id="site-search" role="search">
        <label class="sr-only" for="search-q" data-i18n="searchLabel">Search applications, checklist items and help</label>
        <input id="search-q" type="search" name="q" data-i18n-ph="searchPh" placeholder="Search college, city, checklist item">
        <button class="btn search-btn" type="submit" data-i18n="search">Search</button>
      </form>
    </div>
  </div>
</header>

<div class="global-nav">
  <div class="wrap nav-in">
    <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="main-nav" onclick="A.toggleNav()">
      <span aria-hidden="true">&#9776;</span> <span data-i18n="menu">Menu</span>
    </button>
    <nav class="main" id="main-nav" aria-label="Main navigation"></nav>
    <div class="top-right" id="top-right"></div>
  </div>
</div>

<div class="crumbs-bar">
  <div class="wrap crumbs-in">
    <nav aria-label="Breadcrumb"><ol class="crumbs" id="breadcrumbs"></ol></nav>
    <p class="last-updated"><span data-i18n="lastUpdated">Last Updated On</span>: 26 October 2026</p>
  </div>
</div>

<div class="ticker" id="ticker" hidden>
  <div class="wrap ticker-in">
    <span class="ticker-label" data-i18n="announcements">Announcements</span>
    <div class="ticker-view">
      <div class="ticker-track" id="ticker-track">
        <span>EoA renewal 2027-28: draft applications are open for institutions. Upload documents early to receive gate-level feedback.</span>
        <span>Fire safety certificates expiring on or before 31 March 2026 require renewal before submission.</span>
        <span>Validation findings are advisory. Final decisions on Extension of Approval rest with AICTE authorities.</span>
        <span>Officers may request a live room measurement for any room listed in the building plan.</span>
      </div>
    </div>
    <button type="button" class="util-btn ticker-pause" id="ticker-pause" onclick="A.toggleTicker()" aria-pressed="false">Pause</button>
  </div>
</div>
`;

const SHELL_BOTTOM = `
<footer class="gov-footer">
  <div class="tricolour" aria-hidden="true"><span class="tc-saffron"></span><span class="tc-white"></span><span class="tc-green"></span></div>
  <div class="wrap footer-cols">
    <nav aria-label="Website policies">
      <h2 class="footer-h" data-i18n="fPolicies">Website Policies</h2>
      <ul>
        <li><button type="button" class="footer-link" onclick="A.info('terms')">Terms &amp; Conditions</button></li>
        <li><button type="button" class="footer-link" onclick="A.info('privacy')">Privacy Policy</button></li>
        <li><button type="button" class="footer-link" onclick="A.info('hyperlink')">Hyperlink Policy</button></li>
        <li><button type="button" class="footer-link" onclick="A.info('copyright')">Copyright Policy</button></li>
      </ul>
    </nav>
    <nav aria-label="Quick links">
      <h2 class="footer-h" data-i18n="fQuick">Quick Links</h2>
      <ul>
        <li><button type="button" class="footer-link" onclick="A.info('sitemap')">Sitemap</button></li>
        <li><a class="footer-link" href="#/help">Help</a></li>
        <li><button type="button" class="footer-link" onclick="A.info('feedback')">Feedback</button></li>
        <li><a class="footer-link" href="#/help">FAQs</a></li>
        <li><a class="footer-link" href="#/audit">Audit Trail</a></li>
      </ul>
    </nav>
    <nav aria-label="Related links">
      <h2 class="footer-h" data-i18n="fRelated">Related Links</h2>
      <ul>
        <li><a class="footer-link" href="https://www.aicte-india.org" target="_blank" rel="noopener">AICTE (aicte-india.org)</a></li>
        <li><a class="footer-link" href="https://www.india.gov.in" target="_blank" rel="noopener">National Portal of India (india.gov.in)</a></li>
        <li><a class="footer-link" href="https://www.ugc.gov.in" target="_blank" rel="noopener">UGC (ugc.gov.in)</a></li>
        <li><a class="footer-link" href="#/scenarios">Validation Case Studies</a></li>
      </ul>
    </nav>
    <div>
      <h2 class="footer-h" data-i18n="fContact">Contact</h2>
      <address class="footer-addr">
        Regulation Bureau, AICTE<br>
        Nelson Mandela Marg, Vasant Kunj<br>
        New Delhi — 110070<br>
        Email: <a class="footer-link" href="mailto:portal.support@example.org">portal.support@example.org</a><br>
        <span data-i18n="fContactNote">For portal queries, contact the Regulation Bureau through your institution.</span>
      </address>
    </div>
  </div>
  <div class="footer-strip">
    <div class="wrap strip-in">
      <p>Content owned and maintained by the Regulation Bureau. Designed on the DBIM v3.0 pattern. | <span data-i18n="lastUpdated">Last Updated On</span>: 26 October 2026</p>
      <p class="visitor">Visitor No.: <span class="visit-count mono" id="visit-count">000000</span> <span class="visitor-note">(your visits, this browser)</span></p>
      <p class="strip-icons" aria-label="Related portals">
        <a href="https://www.aicte-india.org" target="_blank" rel="noopener" aria-label="AICTE website (opens in a new tab)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></a>
        <a href="https://www.india.gov.in" target="_blank" rel="noopener" aria-label="National Portal of India (opens in a new tab)"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></a>
      </p>
    </div>
  </div>
</footer>
<div id="overlay"></div>
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Typography per DBIM v3.0: Noto Sans (Latin + Devanagari); mono only for identifiers and hashes. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&family=Noto+Sans+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/styles.css" />
        <link rel="stylesheet" href="/chat.css" />
      </head>
      <body>
        <div dangerouslySetInnerHTML={{ __html: SHELL_TOP }} />
        <main id="main-content" className="wrap" tabIndex={-1} suppressHydrationWarning>
          {children}
        </main>
        <div dangerouslySetInnerHTML={{ __html: SHELL_BOTTOM }} />
        <Script src="/app.js" strategy="afterInteractive" />
        <Script src="/chat.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
