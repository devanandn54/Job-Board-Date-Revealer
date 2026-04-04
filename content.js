const hostname = window.location.hostname;

// ==========================================
// 1. DATA FETCHING ROUTER
// ==========================================

let companyName = "the company"; // Fallback name

// --- LEVER LOGIC ---
if (hostname.includes('lever.co')) {
    setTimeout(() => {
        let datePosted = null;
        
        // Try to grab company name for E-Verify link
        const companyMeta = document.querySelector('meta[property="og:site_name"]');
        if (companyMeta) companyName = companyMeta.content.split("'")[0];

        const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (let script of ldScripts) {
            try {
                const data = JSON.parse(script.innerText);
                if (data['@type'] === 'JobPosting' && data.datePosted) {
                    datePosted = data.datePosted;
                    break;
                }
            } catch (e) {}
        }

        if (!datePosted) {
            const allScripts = document.querySelectorAll('script');
            for (let script of allScripts) {
                const match = script.innerText.match(/"datePosted"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/);
                if (match && match[1]) {
                    datePosted = match[1].split('T')[0];
                    break;
                }
            }
        }

        injectWidget(datePosted, null, companyName);
    }, 1000);
}

// --- ASHBY LOGIC ---
else if (hostname.includes('ashbyhq.com')) {
    setTimeout(() => {
        let datePosted = null;
        let updatedAt = null;

        const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (let script of ldScripts) {
            try {
                const data = JSON.parse(script.innerText);
                if (data['@type'] === 'JobPosting') {
                    if (data.datePosted) datePosted = data.datePosted;
                    if (data.hiringOrganization && data.hiringOrganization.name) {
                        companyName = data.hiringOrganization.name;
                    }
                    break;
                }
            } catch (e) {}
        }

        const allScripts = document.querySelectorAll('script');
        for (let script of allScripts) {
            const match = script.innerText.match(/"updatedAt":"(\d{4}-\d{2}-\d{2}T[^"]+)"/);
            if (match && match[1]) {
                updatedAt = match[1];
                break;
            }
        }

        if (datePosted || updatedAt) injectWidget(datePosted, updatedAt, companyName);
    }, 1000); 
}

// --- GREENHOUSE LOGIC ---
else if (hostname.includes('greenhouse.io')) {
    const urlParts = window.location.pathname.split('/').filter(Boolean);
    const jobsIndex = urlParts.indexOf('jobs');

    if (jobsIndex > 0 && jobsIndex + 1 < urlParts.length) {
        const boardToken = urlParts[jobsIndex - 1];
        companyName = boardToken.replace(/-/g, ' '); // Basic formatting for E-Verify
        
        const jobId = urlParts[jobsIndex + 1].split('?')[0];
        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                if (data.first_published || data.updated_at) {
                    injectWidget(data.first_published, data.updated_at, companyName);
                }
            })
            .catch(err => console.error("Ext Error:", err));
    }
}

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

function calculateDaysAgo(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    date.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = Math.abs(today - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
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

// Targeted Visa Scanner (DOM Cloning Method)
function checkVisaRequirements() {
    // 1. Create an invisible clone of the entire page body
    const bodyClone = document.body.cloneNode(true);

    // 2. Identify all application form containers across different ATS platforms
    const formSelectorsToRemove = [
        'form',                 // Nuke all HTML forms (this catches 99% of application questions)
        '#application',         // Greenhouse specific form wrapper
        '#application_form',    // Greenhouse specific form wrapper
        '.application-form',    // General class
        '.postings-form',       // Lever specific
        '.ashby-application-form' // Ashby specific
    ];

    // 3. Remove these forms from our invisible clone so the scanner can't read them
    formSelectorsToRemove.forEach(selector => {
        const elements = bodyClone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
    });

    // 4. Now extract the text from the cleaned-up clone
    const targetText = bodyClone.innerText;
    
    // Split by punctuation OR newlines
    const sentences = targetText.split(/(?<=[.?!])\s+|\n+/);
    
    const generalRegex = /\b(sponsorship|visa|h1b|h-1b|clearance|citizen|citizenship|green card)\b/i;
    const strictRegex = /\b(OPT|CPT)\b/;
    
    // Expanded ignore list to include EEO boilerplate AND common application questions
    const ignoreRegex = /\b(equal employment|equal opportunity|regardless of|protected class|national origin|sexual orientation|marital status|veteran status|race, color|reporting purposes|self-identification|voluntary|will you now or in the future|legally authorized to work)\b/i;
    
    let foundSentences = [];
    
    for (let sentence of sentences) {
        const cleanSentence = sentence.trim().replace(/\s+/g, ' '); 
        
        // Skip ignored legal/form boilerplate
        if (ignoreRegex.test(cleanSentence)) {
            continue; 
        }
        
        // Check for matches
        if (cleanSentence.length > 15 && (generalRegex.test(cleanSentence) || strictRegex.test(cleanSentence))) {
            foundSentences.push(cleanSentence);
        }
    }
    
    return [...new Set(foundSentences)];
}

// ==========================================
// 3. WIDGET UI GENERATION
// ==========================================

function injectWidget(publishedStr, updatedStr, companyNameStr) {
    if (document.getElementById('job-insight-widget')) return;

    const formatDate = (dateStr) => {
        if (!dateStr) return "N/A";
        return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const pubDays = calculateDaysAgo(publishedStr);
    const upDays = calculateDaysAgo(updatedStr);
    const visaMentions = checkVisaRequirements();

    const widget = document.createElement('div');
    widget.id = 'job-insight-widget';
    
    let html = `
        <div class="gh-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Timeline Insights</span>
        </div>
        <div class="gh-body">
    `;

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

    // Visa Scanner Output
    if (visaMentions.length > 0) {
        html += `<div class="gh-divider"></div>`;
        html += `
            <div class="gh-row gh-warning-row">
                <span class="gh-warning-label">⚠️ Visa / Clearance Mentioned</span>
                <ul class="gh-warning-list">
        `;
        
        visaMentions.slice(0, 2).forEach(sentence => {
            const truncated = sentence.length > 110 ? sentence.substring(0, 110) + '...' : sentence;
            html += `<li>"${truncated}"</li>`;
        });
        
        html += `</ul></div>`;
    }

    // NEW: E-Verify Action Row
    // Generate a URL that searches the USCIS E-Verify database for the company
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
}