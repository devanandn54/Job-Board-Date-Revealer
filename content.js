const hostname = window.location.hostname;
let companyName = "the company";

// ==========================================
// 1. DATA FETCHING ROUTER
// ==========================================

// --- LEVER ---
if (hostname.includes('lever.co')) {
    setTimeout(() => {
        let datePosted = null;

        const companyMeta = document.querySelector('meta[property="og:site_name"]');
        if (companyMeta) companyName = companyMeta.content.split("'")[0];

        for (let script of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                const data = JSON.parse(script.innerText);
                if (data['@type'] === 'JobPosting') {
                    if (data.datePosted) datePosted = data.datePosted;
                    if (data.hiringOrganization?.name) companyName = data.hiringOrganization.name;
                    const loc = extractCountriesFromPosting(data);
                    injectWidget(datePosted, null, companyName, loc);
                    return;
                }
            } catch(e) {}
        }

        for (let script of document.querySelectorAll('script')) {
            const match = script.innerText.match(/"datePosted"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/);
            if (match) { datePosted = match[1].split('T')[0]; break; }
        }

        injectWidget(datePosted, null, companyName, null);
    }, 1000);
}

// --- ASHBY ---
else if (hostname.includes('ashbyhq.com')) {
    setTimeout(() => {
        let datePosted = null, updatedAt = null, locationCountries = null;

        for (let script of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                const data = JSON.parse(script.innerText);
                if (data['@type'] === 'JobPosting') {
                    if (data.datePosted) datePosted = data.datePosted;
                    if (data.hiringOrganization?.name) companyName = data.hiringOrganization.name;
                    locationCountries = extractCountriesFromPosting(data);
                    break;
                }
            } catch(e) {}
        }

        for (let script of document.querySelectorAll('script')) {
            const match = script.innerText.match(/"updatedAt":"(\d{4}-\d{2}-\d{2}T[^"]+)"/);
            if (match) { updatedAt = match[1]; break; }
        }

        injectWidget(datePosted, updatedAt, companyName, locationCountries);
    }, 1000);
}

// --- GREENHOUSE ---
else if (hostname.includes('greenhouse.io')) {
    const urlParts = window.location.pathname.split('/').filter(Boolean);
    const jobsIndex = urlParts.indexOf('jobs');

    if (jobsIndex > 0 && jobsIndex + 1 < urlParts.length) {
        const boardToken = urlParts[jobsIndex - 1];
        companyName = boardToken.replace(/-/g, ' ');
        const jobId = urlParts[jobsIndex + 1].split('?')[0];
        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`;

        fetch(apiUrl)
            .then(r => r.json())
            .then(data => {
                const locationCountries = parseGHLocationString(data.location?.name);
                injectWidget(data.first_published || null, data.updated_at || null, companyName, locationCountries);
            })
            .catch(err => console.error("Ext Error:", err));
    }
}

// --- WORKDAY ---
else if (hostname.includes('myworkdayjobs.com')) {
    if (/\/job\/|\/jobs\//.test(window.location.pathname)) {
        waitAndParseJsonLd(2000, 4);
    }
}

// --- BAMBOOHR ---
else if (hostname.includes('bamboohr.com')) {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts[0] === 'careers' || pathParts[0] === 'jobs') {
        waitAndParseJsonLd(1500, 3);
    }
}

// --- SMARTRECRUITERS ---
else if (hostname === 'jobs.smartrecruiters.com') {
    const srParts = window.location.pathname.split('/').filter(Boolean);
    if (srParts.length >= 2) {
        waitAndParseJsonLd(1000, 3);
    }
}

// --- WORKABLE ---
else if (hostname === 'apply.workable.com') {
    const wkParts = window.location.pathname.split('/').filter(Boolean);
    // Workable job pages: /company/j/JOBID/
    if (wkParts.length >= 3 && wkParts[1] === 'j') {
        waitAndParseJsonLd(1500, 3);
    }
}

// ==========================================
// 2. SHARED JSON-LD UTILITIES
// ==========================================

function waitAndParseJsonLd(delay, maxRetries) {
    let attempts = 0;

    function tryParse() {
        attempts++;
        for (let script of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                const posting = findJobPosting(JSON.parse(script.innerText));
                if (posting) {
                    const locationCountries = extractCountriesFromPosting(posting);
                    if (posting.hiringOrganization?.name) companyName = posting.hiringOrganization.name;
                    else {
                        const meta = document.querySelector('meta[property="og:site_name"]');
                        if (meta) companyName = meta.content.split("'")[0];
                    }
                    injectWidget(posting.datePosted || null, posting.dateModified || null, companyName, locationCountries);
                    return true;
                }
            } catch(e) {}
        }

        // Fallback: raw script scan
        for (let script of document.querySelectorAll('script')) {
            const m = script.innerText.match(/"datePosted"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/);
            if (m) {
                const meta = document.querySelector('meta[property="og:site_name"]');
                if (meta) companyName = meta.content.split("'")[0];
                injectWidget(m[1].split('T')[0], null, companyName, null);
                return true;
            }
        }
        return false;
    }

    setTimeout(() => {
        if (!tryParse() && maxRetries > 1) {
            let retriesLeft = maxRetries - 1;
            const interval = setInterval(() => {
                if (tryParse() || retriesLeft-- <= 0) {
                    clearInterval(interval);
                    // Still inject for visa scan + E-Verify even with no dates
                    if (!document.getElementById('job-insight-widget')) {
                        const meta = document.querySelector('meta[property="og:site_name"]');
                        if (meta) companyName = meta.content.split("'")[0];
                        injectWidget(null, null, companyName, null);
                    }
                }
            }, 1000);
        }
    }, delay);
}

function findJobPosting(data) {
    if (!data || typeof data !== 'object') return null;
    if (data['@type'] === 'JobPosting') return data;
    if (Array.isArray(data)) {
        for (const item of data) { const r = findJobPosting(item); if (r) return r; }
    }
    if (data['@graph'] && Array.isArray(data['@graph'])) {
        for (const item of data['@graph']) { const r = findJobPosting(item); if (r) return r; }
    }
    return null;
}

function extractCountriesFromPosting(posting) {
    if (!posting?.jobLocation) return null;
    const locs = Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation];
    const countries = [];
    for (const loc of locs) {
        if (!loc) continue;
        let country = loc?.address?.addressCountry;
        if (!country) continue;
        if (typeof country === 'object') country = country['@value'] || country.name || '';
        const normalized = country.toUpperCase().trim();
        if (normalized) countries.push(normalized);
    }
    return countries.length > 0 ? countries : null;
}

// Parses Greenhouse's free-text location string (e.g. "London, UK" or "Remote - US")
function parseGHLocationString(locationStr) {
    if (!locationStr) return null;

    const usPatterns = [
        /\b(united states|usa|u\.s\.a|u\.s\.)\b/i,
        /\bremote\s*[-–]?\s*(us|usa)\b/i,
        /\bus\s*[-–]?\s*remote\b/i,
        /\b(new york|los angeles|chicago|san francisco|seattle|austin|boston|denver|atlanta|dallas|miami|portland|remote)\b/i,
        /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/,
    ];

    const nonUSMap = [
        { re: /\b(united kingdom|england|scotland|wales|london|manchester|birmingham|edinburgh|leeds|bristol)\b/i, label: 'United Kingdom' },
        { re: /\b(canada|toronto|vancouver|montreal|ottawa|calgary)\b/i, label: 'Canada' },
        { re: /\b(india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune|chennai|kolkata)\b/i, label: 'India' },
        { re: /\b(germany|berlin|munich|frankfurt|hamburg)\b/i, label: 'Germany' },
        { re: /\b(australia|sydney|melbourne|brisbane|perth)\b/i, label: 'Australia' },
        { re: /\b(singapore)\b/i, label: 'Singapore' },
        { re: /\b(netherlands|amsterdam)\b/i, label: 'Netherlands' },
        { re: /\b(france|paris)\b/i, label: 'France' },
        { re: /\b(ireland|dublin)\b/i, label: 'Ireland' },
        { re: /\b(spain|madrid|barcelona)\b/i, label: 'Spain' },
        { re: /\b(poland|warsaw|krakow)\b/i, label: 'Poland' },
        { re: /\b(brazil|são paulo|sao paulo|rio de janeiro)\b/i, label: 'Brazil' },
        { re: /\b(mexico|mexico city|guadalajara|monterrey)\b/i, label: 'Mexico' },
        { re: /\b(japan|tokyo|osaka)\b/i, label: 'Japan' },
        { re: /\b(israel|tel aviv|jerusalem)\b/i, label: 'Israel' },
        { re: /\b(sweden|stockholm)\b/i, label: 'Sweden' },
        { re: /\b(switzerland|zurich|geneva)\b/i, label: 'Switzerland' },
    ];

    const isUS = usPatterns.some(p => p.test(locationStr));
    if (isUS) return null; // Confirmed US — no warning needed

    for (const { re, label } of nonUSMap) {
        if (re.test(locationStr)) return [label];
    }

    return null; // Can't confidently determine — stay silent
}

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

function calculateDaysAgo(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    date.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor(Math.abs(today - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
}

function getBadgeClass(dateStr) {
    if (!dateStr) return "";
    const diffDays = Math.floor(Math.abs(new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
    if (diffDays <= 14) return "badge-fresh";
    if (diffDays <= 45) return "badge-warm";
    return "badge-stale";
}

function truncate(str, maxLen) {
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function checkVisaRequirements() {
    const bodyClone = document.body.cloneNode(true);

    // Strip tags whose text content is never job description copy
    ['script', 'style', 'noscript', 'template'].forEach(tag => {
        bodyClone.querySelectorAll(tag).forEach(el => el.remove());
    });

    [
        'form', '#application', '#application_form',
        '.application-form', '.postings-form', '.ashby-application-form',
        '[data-qa="application-form"]', '[class*="apply-form"]',
        '[aria-label*="application" i]', '[aria-label*="apply now" i]',
    ].forEach(sel => {
        try { bodyClone.querySelectorAll(sel).forEach(el => el.remove()); } catch(e) {}
    });

    // Use \r\n and Unicode line-separator variants so Ashby/Next.js pages split correctly
    const sentences = bodyClone.innerText.split(/(?<=[.?!])\s+|[\r\n\u2028\u2029]+/);

    // EEO legal boilerplate — skip these entirely
    const ignoreRegex = /\b(equal employment|equal opportunity|regardless of|protected class|national origin|sexual orientation|marital status|veteran status|affirmative action|self-identification|voluntary disclosure|disability|age discrimination)\b/i;

    // Clear disqualifiers — "does not sponsor", "no visa sponsorship", etc. (shown in red)
    const noSponsorPatterns = [
        /\b(does not|do not|cannot|can not|will not|won't|unable to|not able to|currently not)\b.{0,50}\b(sponsor|sponsorship)\b/i,
        /\bno\s+visa\s+sponsorship\b/i,
        /\bno\s+sponsorship\b/i,
        /\b(sponsorship|visa)\s+(is\s+)?not\s+(available|offered|provided|supported)\b/i,
        /\bwithout\s+(visa\s+)?sponsorship\b/i,
        /\bnot\s+able\s+to\s+(provide|offer|support)\s+(visa\s+)?sponsorship\b/i,
        /\bmust\s+.{0,40}\bwithout\s+sponsorship\b/i,
        /\bauthorized\s+to\s+work\s+without\s+(the\s+need\s+for\s+)?sponsorship\b/i,
    ];

    // Positive sponsorship signals (shown in green) — checked only if noSponsor didn't match
    const proSponsorPatterns = [
        /\b(happy|willing|excited|glad|open|pleased|proud)\s+to\s+sponsor\b/i,
        /\bwe\s+(do\s+|will\s+|can\s+|are\s+able\s+to\s+)?sponsor\b/i,
        /\bvisa\s+sponsorship\s+(is\s+)?(available|offered|provided|supported)\b/i,
        /\bsponsorship\s+(is\s+)?(available|offered|provided)\b/i,
        /\b(will|can)\s+sponsor\b/i,
        /\bdo\s+sponsor\b/i,
        /\bsponsoring?\s+(h[-\u2011]?1b|h[-\u2011]?4|opt|ead|e3|o[-\u2011]?1|tn|green\s+card|international|work\s+visa)\b/i,
        /\b(offer|provide|support)\s+(visa\s+)?sponsorship\b/i,
    ];

    // General mentions worth flagging (shown in yellow)
    const generalRegex = /\b(sponsorship|visa|h[-\u2011]?1b|h[-\u2011]?4|security clearance|clearance|citizen(?:ship)?|green\s+card|work\s+authorization|work\s+permit|authorized\s+to\s+work|permanent\s+resident)\b/i;
    const strictRegex = /\b(OPT|CPT|EAD)\b/;

    const noSponsorSentences = [];
    const proSponsorSentences = [];
    const generalSentences = [];

    for (let sentence of sentences) {
        const clean = sentence.trim().replace(/\s+/g, ' ');
        if (clean.length < 15) continue;
        if (ignoreRegex.test(clean)) continue;

        // Skip content that leaked from JSON/schema blobs:
        // literal \n / \t escape sequences mean the text came from a serialized JSON string
        if (clean.includes('\\n') || clean.includes('\\t') || clean.includes('\\u00')) continue;
        // JSON object/array brackets or key:value patterns (e.g. "isNullable":false)
        if (/[{}\[\]]/.test(clean)) continue;
        if (/"[a-zA-Z]+":\s*(true|false|null|\d)/.test(clean)) continue;
        // Sentences that are mostly non-alphabetic are code/data, not prose
        const alphaCount = (clean.match(/[a-zA-Z\s]/g) || []).length;
        if (alphaCount / clean.length < 0.55) continue;

        const isNoSponsor = noSponsorPatterns.some(p => p.test(clean));
        if (isNoSponsor) {
            noSponsorSentences.push(clean);
            continue;
        }
        const isProSponsor = proSponsorPatterns.some(p => p.test(clean));
        if (isProSponsor) {
            proSponsorSentences.push(clean);
        } else if (generalRegex.test(clean) || strictRegex.test(clean)) {
            generalSentences.push(clean);
        }
    }

    return {
        noSponsor: [...new Set(noSponsorSentences)],
        proSponsor: [...new Set(proSponsorSentences)],
        general: [...new Set(generalSentences)],
    };
}

// ==========================================
// 4. WIDGET UI GENERATION
// ==========================================

function injectWidget(publishedStr, updatedStr, companyNameStr, locationCountries = null) {
    if (document.getElementById('job-insight-widget')) return;

    const formatDate = (dateStr) => {
        if (!dateStr) return "N/A";
        return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const pubDays = calculateDaysAgo(publishedStr);
    const upDays = calculateDaysAgo(updatedStr);
    const visaResult = checkVisaRequirements();

    // Determine if we should show a non-US location warning
    let locationWarning = null;
    if (locationCountries && locationCountries.length > 0) {
        const usVariants = ['US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA'];
        const allUS = locationCountries.every(c => usVariants.includes(c));
        const hasUS = locationCountries.some(c => usVariants.includes(c));
        if (!hasUS) {
            locationWarning = locationCountries.join(', ');
        } else if (!allUS) {
            locationWarning = `Multi-region (${locationCountries.join(', ')})`;
        }
    }

    const widget = document.createElement('div');
    widget.id = 'job-insight-widget';

    let html = `
        <div class="gh-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Timeline Insights</span>
            <button class="gh-collapse-btn" title="Minimize">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
            </button>
        </div>
        <div class="gh-body">
    `;

    // Non-US role notice
    if (locationWarning) {
        html += `
            <div class="gh-row gh-location-row">
                <div style="display:flex;flex-direction:column;gap:4px;width:100%;">
                    <span class="gh-location-label">📍 Non-US Role Detected</span>
                    <span class="gh-location-text">${locationWarning} — E-Verify may not apply.</span>
                </div>
            </div>
        `;
        html += `<div class="gh-divider"></div>`;
    }

    if (publishedStr) {
        html += `
            <div class="gh-row">
                <div class="gh-info">
                    <span class="gh-label">Published</span>
                    <span class="gh-date">${formatDate(publishedStr)}</span>
                </div>
                ${pubDays ? `<span class="gh-badge ${getBadgeClass(publishedStr)}">${pubDays}</span>` : ''}
            </div>
        `;
    }

    if (updatedStr) {
        if (publishedStr) html += `<div class="gh-divider"></div>`;
        html += `
            <div class="gh-row">
                <div class="gh-info">
                    <span class="gh-label">Last Updated</span>
                    <span class="gh-date">${formatDate(updatedStr)}</span>
                </div>
                ${upDays ? `<span class="gh-badge ${getBadgeClass(updatedStr)}">${upDays}</span>` : ''}
            </div>
        `;
    }

    // Sponsorship available — green
    if (visaResult.proSponsor.length > 0) {
        html += `<div class="gh-divider"></div>`;
        html += `
            <div class="gh-row gh-prosponsor-row">
                <span class="gh-prosponsor-label">✅ Sponsorship Available</span>
                <ul class="gh-warning-list">
        `;
        visaResult.proSponsor.slice(0, 2).forEach(s => {
            html += `<li>"${truncate(s, 110)}"</li>`;
        });
        html += `</ul></div>`;
    }

    // No sponsorship — red warning
    if (visaResult.noSponsor.length > 0) {
        html += `<div class="gh-divider"></div>`;
        html += `
            <div class="gh-row gh-nosponsor-row">
                <span class="gh-nosponsor-label">🚫 Sponsorship Not Available</span>
                <ul class="gh-warning-list">
        `;
        visaResult.noSponsor.slice(0, 2).forEach(s => {
            html += `<li>"${truncate(s, 110)}"</li>`;
        });
        html += `</ul></div>`;
    }

    // General visa/clearance mention — yellow warning
    if (visaResult.general.length > 0) {
        html += `<div class="gh-divider"></div>`;
        html += `
            <div class="gh-row gh-warning-row">
                <span class="gh-warning-label">⚠️ Visa / Clearance Mentioned</span>
                <ul class="gh-warning-list">
        `;
        visaResult.general.slice(0, 2).forEach(s => {
            html += `<li>"${truncate(s, 110)}"</li>`;
        });
        html += `</ul></div>`;
    }

    // E-Verify link
    const everifyUrl = `https://www.e-verify.gov/about-e-verify/e-verify-data/how-to-find-participating-employers?search_api_fulltext=${encodeURIComponent(companyNameStr)}`;

    html += `<div class="gh-divider"></div>`;
    html += `
        <div class="gh-row" style="justify-content: center; margin-top: 8px;">
            <a href="${everifyUrl}" target="_blank" style="color: #60a5fa !important; font-size: 12px !important; text-decoration: none !important; font-weight: 600 !important; display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                Check E-Verify Status
            </a>
        </div>
    `;

    html += `</div>`;
    widget.innerHTML = html;
    document.body.appendChild(widget);

    // Collapse / expand toggle
    const collapseBtn = widget.querySelector('.gh-collapse-btn');
    const isCollapsed = localStorage.getItem('ats-insight-collapsed') === 'true';

    if (isCollapsed) {
        widget.classList.add('collapsed');
        collapseBtn.classList.add('collapsed');
    }

    collapseBtn.addEventListener('click', () => {
        const nowCollapsing = !widget.classList.contains('collapsed');
        widget.classList.toggle('collapsed', nowCollapsing);
        collapseBtn.classList.toggle('collapsed', nowCollapsing);
        localStorage.setItem('ats-insight-collapsed', String(nowCollapsing));
    });
}
