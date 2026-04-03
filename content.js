const hostname = window.location.hostname;

// ==========================================
// 1. DATA FETCHING ROUTER
// ==========================================

// --- LEVER LOGIC ---
if (hostname.includes('lever.co')) {
    setTimeout(() => {
        let datePosted = null;
        
        // Try to find the date in the JSON-LD script first
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

        // Fallback: Regex scan all scripts for Lever's specific data structure
        if (!datePosted) {
            const allScripts = document.querySelectorAll('script');
            for (let script of allScripts) {
                const match = script.innerText.match(/"datePosted"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"/);
                if (match && match[1]) {
                    datePosted = match[1].split('T')[0]; // Clean the string
                    break;
                }
            }
        }

        injectWidget(datePosted, null);
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
                if (data['@type'] === 'JobPosting' && data.datePosted) {
                    datePosted = data.datePosted;
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

        if (datePosted || updatedAt) injectWidget(datePosted, updatedAt);
    }, 1000); 
}

// --- GREENHOUSE LOGIC ---
else if (hostname.includes('greenhouse.io')) {
    const urlParts = window.location.pathname.split('/').filter(Boolean);
    const jobsIndex = urlParts.indexOf('jobs');

    if (jobsIndex > 0 && jobsIndex + 1 < urlParts.length) {
        const boardToken = urlParts[jobsIndex - 1];
        const jobId = urlParts[jobsIndex + 1].split('?')[0];
        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`;

        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                if (data.first_published || data.updated_at) {
                    injectWidget(data.first_published, data.updated_at);
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

// Intelligent Visa and Clearance Scanner
function checkVisaRequirements() {
    const bodyText = document.body.innerText;
    
    // Split by punctuation OR newlines so bullet points don't bleed into each other
    const sentences = bodyText.split(/(?<=[.?!])\s+|\n+/);
    
    // 1. Case-INSENSITIVE regex with Word Boundaries (\b) for general terms
    const generalRegex = /\b(sponsorship|visa|h1b|h-1b|clearance|citizen|citizenship|green card)\b/i;
    
    // 2. Case-SENSITIVE regex for acronyms to prevent matching "opt-in" or "opt out"
    const strictRegex = /\b(OPT|CPT)\b/;

    // 3. IGNORE Regex for EEO Legal Boilerplate
    const ignoreRegex = /\b(equal employment|equal opportunity|regardless of|protected class|national origin|sexual orientation|marital status|veteran status|race, color)\b/i;
    
    let foundSentences = [];
    
    for (let sentence of sentences) {
        const cleanSentence = sentence.trim().replace(/\s+/g, ' '); // Clean up double spaces
        
        // If the sentence looks like an Equal Opportunity statement, skip it immediately!
        if (ignoreRegex.test(cleanSentence)) {
            continue; 
        }
        
        // Ignore tiny fragments and check our smart regex patterns
        if (cleanSentence.length > 15 && (generalRegex.test(cleanSentence) || strictRegex.test(cleanSentence))) {
            foundSentences.push(cleanSentence);
        }
    }
    
    // Return unique sentences only to prevent duplicates
    return [...new Set(foundSentences)];
}

// ==========================================
// 3. WIDGET UI GENERATION
// ==========================================

function injectWidget(publishedStr, updatedStr) {
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

    // Inject Visa/Clearance warnings if found
    if (visaMentions.length > 0) {
        html += `<div class="gh-divider"></div>`;
        html += `
            <div class="gh-row gh-warning-row">
                <span class="gh-warning-label">⚠️ Visa / Clearance Mentioned</span>
                <ul class="gh-warning-list">
        `;
        
        // Show up to 2 sentences to keep the widget from getting too tall
        visaMentions.slice(0, 2).forEach(sentence => {
            const truncated = sentence.length > 110 ? sentence.substring(0, 110) + '...' : sentence;
            html += `<li>"${truncated}"</li>`;
        });
        
        html += `</ul></div>`;
    }

    html += `</div>`;
    widget.innerHTML = html;
    document.body.appendChild(widget);
}