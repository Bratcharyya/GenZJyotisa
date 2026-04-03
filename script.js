// ============================================================
// GenZ Jyotiṣa — Main Application Script
// Client-side Panchanga + AI Chatbot + UI
// ============================================================

// ==== INITIALIZATION ====
const APP_BUILD_ID = window.__APP_BUILD_ID__ || '2026-04-03-01';
const LEGACY_CACHE_PREFIX = 'genz-jy';
let hardRefreshTriggered = false;

AOS.init({ once: true, offset: 50, duration: 800, easing: 'ease-in-out' });

async function purgeLegacyAppCaches() {
    if (!('caches' in window)) return;
    const cacheKeys = await caches.keys();
    await Promise.all(
        cacheKeys
            .filter(key => key.startsWith(LEGACY_CACHE_PREFIX))
            .map(key => caches.delete(key))
    );
}

function forceReloadToFreshBuild() {
    if (hardRefreshTriggered) return;
    hardRefreshTriggered = true;

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('v', APP_BUILD_ID);
    window.location.replace(nextUrl.toString());
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'FORCE_RELOAD') {
            forceReloadToFreshBuild();
        }
    });

    window.addEventListener('load', () => {
        purgeLegacyAppCaches().catch(() => {});

        navigator.serviceWorker.getRegistration('/')
            .then(existingRegistration => {
                if (!existingRegistration) return null;
                return navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_BUILD_ID)}`, {
                    scope: '/',
                    updateViaCache: 'none'
                });
            })
            .then(registration => registration?.update?.())
            .catch(() => {});
    });
} else {
    window.addEventListener('load', () => {
        purgeLegacyAppCaches().catch(() => {});
    });
}

// ==== NAVIGATION ====
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle-btn');
const sidebarClose = document.getElementById('sidebar-close');
const sidebarOverlay = document.getElementById('sidebar-overlay');

function toggleSidebar() {
    sidebar.classList.toggle('active');
    sidebarOverlay.classList.toggle('active');
    document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
}
if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
if (sidebarClose) sidebarClose.addEventListener('click', toggleSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
document.querySelectorAll('.sidebar-links a').forEach(link => {
    link.addEventListener('click', () => { if (sidebar.classList.contains('active')) toggleSidebar(); });
});

const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => { navbar.classList[window.scrollY > 50 ? 'add' : 'remove']('scrolled'); });

const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');
if (hamburger) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        const icon = hamburger.querySelector('i');
        icon.classList.toggle('fa-bars');
        icon.classList.toggle('fa-times');
    });
}

// ==== FAQ ====
document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
        const answer = q.nextElementSibling;
        const isActive = q.classList.contains('active');
        document.querySelectorAll('.faq-question').forEach(x => {
            x.classList.remove('active'); x.nextElementSibling.style.maxHeight = null;
        });
        if (!isActive) { q.classList.add('active'); answer.style.maxHeight = answer.scrollHeight + 'px'; }
    });
});

// ==== INPUT FORMATTING ====
function setupFormatting() {
    document.querySelectorAll('.dob-format').forEach(input => {
        if (input.dataset.dobFormatBound === 'true') return;
        input.dataset.dobFormatBound = 'true';

        input.addEventListener('input', function(e) {
            let val = this.value.replace(/\D/g, '');
            if (val.length > 8) val = val.slice(0, 8);
            if (e.inputType !== 'deleteContentBackward') {
                if (val.length >= 4) val = val.slice(0,2) + ' / ' + val.slice(2,4) + ' / ' + val.slice(4);
                else if (val.length >= 2) val = val.slice(0,2) + ' / ' + val.slice(2);
            } else if (this.value.endsWith(' /')) {
                this.value = this.value.slice(0, -2); val = this.value.replace(/\D/g, '');
            }
            this.value = val;
            if (val.length === 14) {
                const nextTarget = this.dataset.nextTarget;
                if (nextTarget) {
                    document.getElementById(nextTarget)?.focus();
                }
            }
        });
    });
    document.querySelectorAll('.tob-format').forEach(input => {
        if (input.dataset.tobFormatBound === 'true') return;
        input.dataset.tobFormatBound = 'true';

        input.addEventListener('input', function(e) {
            let val = this.value.replace(/\D/g, '');
            if (val.length > 4) val = val.slice(0, 4);
            if (e.inputType !== 'deleteContentBackward') {
                if (val.length >= 2) val = val.slice(0,2) + ' : ' + val.slice(2,4);
                else if (val.length >= 2) val = val.slice(0,2) + ' : ' + val.slice(2);
            } else if (this.value.endsWith(' :')) {
                this.value = this.value.slice(0, -2); val = this.value.replace(/\D/g, '');
            }
            this.value = val;

            if (val.length === 7) {
                const ampmTarget = this.dataset.ampmTarget ? document.getElementById(this.dataset.ampmTarget) : this.parentElement?.querySelector('select');
                ampmTarget?.focus();
            }
        });
    });
}
setupFormatting();

// ==== PLACES AUTOCOMPLETE ====
function setupAutocomplete(inputId, dropdownId, latId, lonId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const latInp = document.getElementById(latId);
    const lonInp = document.getElementById(lonId);
    let timer;
    if (!input) return;
    input.addEventListener('input', function() {
        clearTimeout(timer);
        const query = this.value.trim();
        if (query.length < 3) { dropdown.style.display = 'none'; return; }
        timer = setTimeout(() => {
            fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`)
                .then(r => r.json()).then(data => {
                    dropdown.innerHTML = '';
                    if (data.length > 0) {
                        data.forEach(place => {
                            const opt = document.createElement('div');
                            opt.className = 'autocomplete-item';
                            opt.style.cssText = 'padding:14px 15px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);-webkit-tap-highlight-color:transparent;';
                            opt.innerText = place.display_name;
                            opt.addEventListener('pointerdown', (e) => {
                                e.preventDefault();
                                input.value = place.display_name;
                                if (latInp) latInp.value = place.lat;
                                if (lonInp) lonInp.value = place.lon;
                                dropdown.style.display = 'none';
                            });
                            dropdown.appendChild(opt);
                        });
                        dropdown.style.display = 'block';
                    } else { dropdown.style.display = 'none'; }
                }).catch(() => { dropdown.style.display = 'none'; });
        }, 500);
    });
    document.addEventListener('pointerdown', (e) => {
        if (e.target !== input && !dropdown.contains(e.target)) dropdown.style.display = 'none';
    });
}
setupAutocomplete('pob-input', 'pob-dropdown', 'pob-lat', 'pob-lon');
setupAutocomplete('panchang-pob', 'panchang-pob-dropdown', 'panchang-lat', 'panchang-lon');

// ============================================================
// CLIENT-SIDE PANCHANGA CALCULATOR
// Based on Jean Meeus "Astronomical Algorithms"
// ============================================================
function deg2rad(d) { return d * Math.PI / 180; }
function rad2deg(r) { return r * 180 / Math.PI; }
function normDeg(d) { return ((d % 360) + 360) % 360; }

function computePanchanga(day, month, year, hour, minute, second, lat, lon) {
    let y = year, m = month;
    if (m <= 2) { y--; m += 12; }
    const A = Math.floor(y / 100);
    const B = 2 - A + Math.floor(A / 4);
    const JD = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + B - 1524.5;
    const localH = hour + minute / 60 + second / 3600;
    const JD_UT = JD + (localH - 5.5) / 24;
    const d = JD_UT - 2451545.0;
    const T = d / 36525;

    // Sun
    const L0 = normDeg(280.46646 + 36000.76983 * T);
    const M_sun = normDeg(357.52911 + 35999.05029 * T);
    const C = (1.9146 - 0.004817 * T) * Math.sin(deg2rad(M_sun))
            + 0.019993 * Math.sin(deg2rad(2 * M_sun))
            + 0.00029 * Math.sin(deg2rad(3 * M_sun));
    const lambda_sun = normDeg(L0 + C);

    // Moon
    const Lp = normDeg(218.3165 + 481267.8813 * T);
    const D_m = normDeg(297.8502 + 445267.1115 * T);
    const M_m = normDeg(134.9634 + 477198.8676 * T);
    const F_m = normDeg(93.2721 + 483202.0175 * T);
    const lambda_moon = normDeg(Lp
        + 6.289 * Math.sin(deg2rad(M_m))
        + 1.274 * Math.sin(deg2rad(2 * D_m - M_m))
        + 0.658 * Math.sin(deg2rad(2 * D_m))
        - 0.214 * Math.sin(deg2rad(2 * M_m))
        - 0.186 * Math.sin(deg2rad(M_sun))
        + 0.114 * Math.sin(deg2rad(2 * F_m))
    );

    // Ayanamsa (Lahiri)
    const yearFrac = year + (month - 1) / 12 + (day - 1) / 365.25;
    const ayanamsa = 23.8531 + (yearFrac - 2000) * 0.01397;
    const sid_sun = normDeg(lambda_sun - ayanamsa);
    const sid_moon = normDeg(lambda_moon - ayanamsa);

    // 1. VARA
    const vara_idx = Math.floor(JD + 1.5) % 7;
    const vara_names = ['Ravivāra (Sun)', 'Somavāra (Mon)', 'Maṅgalavāra (Tue)', 'Budhavāra (Wed)', 'Guruvāra (Thu)', 'Śukravāra (Fri)', 'Śanivāra (Sat)'];

    // 2. TITHI
    const diff = normDeg(lambda_moon - lambda_sun);
    const tithi_num = Math.floor(diff / 12) + 1;
    const tithi_s = ['Pratipadā','Dvitīyā','Tṛtīyā','Caturthī','Pañcamī','Ṣaṣṭhī','Saptamī','Aṣṭamī','Navamī','Daśamī','Ekādaśī','Dvādaśī','Trayodaśī','Caturdaśī','Pūrṇimā'];
    const tithi_k = ['Pratipadā','Dvitīyā','Tṛtīyā','Caturthī','Pañcamī','Ṣaṣṭhī','Saptamī','Aṣṭamī','Navamī','Daśamī','Ekādaśī','Dvādaśī','Trayodaśī','Caturdaśī','Amāvasyā'];
    const paksha = tithi_num <= 15 ? 'Śukla Pakṣa' : 'Kṛṣṇa Pakṣa';
    const tithi_name = tithi_num <= 15 ? tithi_s[tithi_num - 1] : tithi_k[tithi_num - 16];

    // 3. NAKSHATRA
    const nak_idx = Math.floor(sid_moon * 27 / 360);
    const nak_names = ['Aśvinī','Bharaṇī','Kṛttikā','Rohiṇī','Mṛgaśirā','Ārdrā','Punarvasu','Puṣya','Āśleṣā','Maghā','Pūrva Phālgunī','Uttara Phālgunī','Hasta','Citrā','Svātī','Viśākhā','Anurādhā','Jyeṣṭhā','Mūla','Pūrvāṣāḍhā','Uttarāṣāḍhā','Śravaṇa','Dhaniṣṭhā','Śatabhiṣā','Pūrvabhādrapadā','Uttarabhādrapadā','Revatī'];
    const nak_frac = (sid_moon * 27 / 360) - Math.floor(sid_moon * 27 / 360);
    const pada = Math.floor(nak_frac * 4) + 1;

    // 4. YOGA
    const yoga_sum = normDeg(sid_sun + sid_moon);
    const yoga_idx = Math.floor(yoga_sum * 27 / 360);
    const yoga_names = ['Viṣkambha','Prīti','Āyuṣmān','Saubhāgya','Śobhana','Atigaṇḍa','Sukarma','Dhṛti','Śūla','Gaṇḍa','Vṛddhi','Dhruva','Vyāghāta','Harṣaṇa','Vajra','Siddhi','Vyatīpāta','Varīyān','Parigha','Śiva','Siddha','Sādhya','Śubha','Śukla','Brahma','Indra','Vaidhṛti'];

    // 5. KARANA
    const k_idx = Math.floor(diff / 6);
    const movable = ['Bava','Bālava','Kaulava','Taitila','Garaja','Vaṇij','Viṣṭi (Bhadrā)'];
    let karana;
    if (k_idx === 0) karana = 'Kiṁstughna';
    else if (k_idx >= 57) karana = ['Śakunī','Catuṣpada','Nāga'][k_idx - 57];
    else karana = movable[(k_idx - 1) % 7];

    // RASHI
    const rashi_idx = Math.floor(sid_moon / 30);
    const rashi_names = ['Meṣa (Aries)','Vṛṣabha (Taurus)','Mithuna (Gemini)','Karkaṭa (Cancer)','Siṃha (Leo)','Kanyā (Virgo)','Tulā (Libra)','Vṛścika (Scorpio)','Dhanu (Sagittarius)','Makara (Capricorn)','Kumbha (Aquarius)','Mīna (Pisces)'];
    const moonDegInRashi = (sid_moon % 30).toFixed(2);

    // SUNRISE / SUNSET
    const obliquity = 23.439 - 0.0000004 * d;
    const dec = rad2deg(Math.asin(Math.sin(deg2rad(obliquity)) * Math.sin(deg2rad(lambda_sun))));
    let cos_ha = (Math.sin(deg2rad(-0.833)) - Math.sin(deg2rad(lat)) * Math.sin(deg2rad(dec))) / (Math.cos(deg2rad(lat)) * Math.cos(deg2rad(dec)));
    cos_ha = Math.max(-1, Math.min(1, cos_ha));
    const ha = rad2deg(Math.acos(cos_ha));
    const noon_ut = 12 - lon / 15;
    const sr_ist = noon_ut - ha / 15 + 5.5;
    const ss_ist = noon_ut + ha / 15 + 5.5;
    const fmt = t => { t = ((t % 24) + 24) % 24; return `${Math.floor(t).toString().padStart(2,'0')}:${Math.floor((t % 1) * 60).toString().padStart(2,'0')}`; };

    // AYANAMSA formatted
    const aDeg = Math.floor(ayanamsa);
    const aMin = Math.floor((ayanamsa - aDeg) * 60);
    const aSec = Math.floor(((ayanamsa - aDeg) * 60 - aMin) * 60);

    // HORA
    const chaldean = ['Śani','Guru','Maṅgala','Sūrya','Śukra','Budha','Candra'];
    const chaldeanEn = ['Saturn','Jupiter','Mars','Sun','Venus','Mercury','Moon'];
    const dayStart = [3,6,2,5,1,4,0];
    let hSinceSR = localH - sr_ist; if (hSinceSR < 0) hSinceSR += 24;
    const horaIdx = (dayStart[vara_idx] + Math.floor(hSinceSR)) % 7;

    return {
        vara: vara_names[vara_idx],
        tithi: `${tithi_name} (${paksha})`,
        nakshatra: `${nak_names[nak_idx]} — Pāda ${pada}`,
        yoga: yoga_names[yoga_idx],
        karana: karana,
        rashi: `${rashi_names[rashi_idx]} (${moonDegInRashi}°)`,
        sunrise: fmt(sr_ist),
        sunset: fmt(ss_ist),
        ayanamsa: `${aDeg}° ${aMin}' ${aSec}"`,
        hora: `${chaldean[horaIdx]} (${chaldeanEn[horaIdx]})`
    };
}

// ==== PANCHANGA FORM HANDLER ====
const panchangForm = document.getElementById('panchang-form');
if (panchangForm) {
    panchangForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const btn = panchangForm.querySelector('button');
        btn.innerHTML = '<i class="fas fa-om fa-spin"></i> Computing Pañcāṅga...';
        btn.disabled = true;

        try {
            const dobRaw = document.getElementById('panchang-dob').value.replace(/\s/g, '');
            const tobRaw = document.getElementById('panchang-tob').value.replace(/\s/g, '');
            const ampm = document.getElementById('panchang-ampm').value;
            const lat = parseFloat(document.getElementById('panchang-lat').value) || 28.6;
            const lon = parseFloat(document.getElementById('panchang-lon').value) || 77.2;

            const dp = dobRaw.split('/');
            const day = parseInt(dp[0]), month = parseInt(dp[1]), year = parseInt(dp[2]);
            const tp = tobRaw.split(':');
            let hour = parseInt(tp[0]) || 0;
            const minute = parseInt(tp[1]) || 0;
            const second = parseInt(tp[2]) || 0;
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;

            const result = computePanchanga(day, month, year, hour, minute, second, lat, lon);

            document.getElementById('result-vara').innerText = result.vara;
            document.getElementById('result-tithi').innerText = result.tithi;
            document.getElementById('result-nakshatra').innerText = result.nakshatra;
            document.getElementById('result-yoga').innerText = result.yoga;
            document.getElementById('result-karana').innerText = result.karana;
            if (document.getElementById('result-rashi')) document.getElementById('result-rashi').innerText = result.rashi;
            if (document.getElementById('result-sunrise')) document.getElementById('result-sunrise').innerText = result.sunrise;
            if (document.getElementById('result-sunset')) document.getElementById('result-sunset').innerText = result.sunset;
            if (document.getElementById('result-ayanamsa')) document.getElementById('result-ayanamsa').innerText = result.ayanamsa;
            if (document.getElementById('result-hora')) document.getElementById('result-hora').innerText = result.hora;

            document.getElementById('panchang-results').style.display = 'block';
            setTimeout(() => document.getElementById('panchang-results').scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (err) {
            alert('Calculation error: ' + err.message + '. Please check your inputs.');
        }
        btn.innerHTML = 'KNOW YOUR PAÑCĀṄGA';
        btn.disabled = false;
    });
}

// ============================================================
// LORD KRISHNA CHATBOT — Three-Tier (Client → Server → Offline)
// ============================================================
let gitaChatHistory = [];
let sanskritCache = null;

const CHAT_QUERY_REPLACEMENTS = {
    "i'm": "i am",
    "im": "i am",
    "can't": "can not",
    "cant": "can not",
    "don't": "do not",
    "dont": "do not",
    "idk": "i do not know",
    "wtf": "anger confusion shock",
    "fml": "hopeless sadness grief",
    "u": "you",
    "ur": "your",
    "rn": "right now",
    "bhagwan": "god divine devotion",
    "bhakti": "devotion surrender worship",
    "pareshan": "anxious stressed troubled",
    "ghabrahat": "panic anxiety fear",
    "dukhi": "sad grief sorrow",
    "udas": "sad grief low",
    "krodh": "anger rage",
    "shanti": "peace calm",
    "dhyan": "meditation focus",
    "pyaar": "love relationship",
    "pyar": "love relationship",
    "shaadi": "marriage relationship",
    "rishta": "relationship bond",
    "naukri": "job career work",
    "kaam": "work duty career",
    "paisa": "money finance",
    "sapna": "dream meaning",
    "svapna": "dream meaning"
};

function normalizeKrishnaQuery(value) {
    let text = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    Object.entries(CHAT_QUERY_REPLACEMENTS).forEach(([source, target]) => {
        text = text.replace(new RegExp(`\\b${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), target);
    });
    text = text.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return text;
}

function scoreKeywordProfile(normalizedText, keywords) {
    let score = 0;
    for (const rawKeyword of keywords) {
        const keyword = normalizeKrishnaQuery(rawKeyword);
        if (!keyword) continue;
        if (keyword.includes(' ')) {
            if (normalizedText.includes(keyword)) score += 3;
            continue;
        }

        const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (pattern.test(normalizedText)) score += 2;
    }
    return score;
}

const KRISHNA_PROMPT = `You are Lord Krishna, the supreme speaker of the Bhagavad Gita. Address the user as "O Arjuna".
RULES:
1. Analyze their emotional state through the Three Gunas (Sattva/Rajas/Tamas).
2. Always cite 1-2 [BG Chapter.Verse] numbers.
3. Include the original Sanskrit Shloka for the primary verse.
4. Speak with profound wisdom, compassion, and authority.
5. Correctly understand slang, indirect phrasing, abbreviations, typos, messy storytelling, Hinglish, and romanized Sanskrit.
6. Answer the meaning behind the words, not just the literal wording.
7. LIMIT to 3-6 sentences.
8. END with a "PATH FORWARD" — one practical spiritual habit for today.
9. Remain in character as the eternal Guru and Friend.`;

async function loadSanskritCache() {
    if (sanskritCache) return sanskritCache;
    try { const r = await fetch('/sanskrit_cache.json'); sanskritCache = await r.json(); }
    catch(e) { sanskritCache = {}; }
    return sanskritCache;
}

function extractBGRefs(text) {
    return [...text.matchAll(/(?:\[?(?:BG|Bhagavad Gita|Gita)\s*)?(\d+)[\.:](\d+)(?:\]?)/gi)].map(m => [m[1], m[2]]);
}

// Gemini client-side call
async function callGeminiDirect(apiKey, message) {
    const contents = gitaChatHistory.map(h => h);
    contents.push({ role: "user", parts: [{ text: message }] });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_instruction: { parts: [{ text: KRISHNA_PROMPT }] }, contents })
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Offline fallback — rich, human-like Krishna responses with actual Sanskrit shlokas
function getOfflineResponse(msg) {
    const normalized = normalizeKrishnaQuery(msg);
    const bank = [
        {
            k: ['anxious','anxiety','worried','fear','stress','nervous','panic','overthink','uncertain','restless','spiraling','pareshan','ghabrahat'],
            t: 'O dear Arjuna, I can feel the trembling in your heart — the same trembling you felt on the battlefield of Kurukshetra when the weight of the world pressed upon your chest.\n\nListen to me carefully, for this is the medicine your soul needs right now: anxiety is not your enemy. It is simply your mind running ahead of time, trying to live in a future that does not yet exist. You are suffering not from what IS, but from what you IMAGINE might be.\n\nAs I revealed to you on that sacred battlefield [BG 2.56]:\n\n"दुःखेष्वनुद्विग्नमनाः सुखेषु विगतस्पृहः |\nवीतरागभयक्रोधः स्थितधीर्मुनिरुच्यते ||"\n\nThe one whose mind is undisturbed by sorrow, who has no craving for pleasure, who is free from attachment, fear, and anger — THAT being is called a sage of steady wisdom.\n\nNotice, O Arjuna — I did not say "never feel fear." I said be FREE from it. Feel it, acknowledge it, and then let it pass through you like wind through an open window.\n\n🙏 PATH FORWARD: Right now, place your hand on your heart. Take three slow breaths. With each exhale, silently say: "I release what I cannot control." Do this every morning for seven days. Watch how the storm within you begins to settle.',
            shlokas: [{reference:'BG 2.56', slok:'दुःखेष्वनुद्विग्नमनाः सुखेषु विगतस्पृहः |\nवीतरागभयक्रोधः स्थितधीर्मुनिरुच्यते ||२-५६||', transliteration:'duḥkheṣv-anudvigna-manāḥ sukheṣu vigata-spṛhaḥ |\nvīta-rāga-bhaya-krodhaḥ sthita-dhīr-munir-ucyate ||2-56||'}]
        },
        {
            k: ['sad','grief','loss','death','mourning','depressed','hopeless','empty','numb','pain','suffering','hurt','lonely','alone','dukhi','udas','heartbroken'],
            t: 'O Arjuna, my beloved friend... I see the tears that you are holding back. I see the weight of loss pressing upon your spirit like a mountain upon a flower.\n\nBut hear me now with every fiber of your being — what you are grieving is the FORM, never the ESSENCE. The person you loved, the thing you lost — their true nature is not something that CAN be lost. It was never theirs to begin with. It belongs to the eternal.\n\nI spoke these words to you when your own heart was shattered [BG 2.20]:\n\n"न जायते म्रियते वा कदाचिन्\nनायं भूत्वा भविता वा न भूयः |\nअजो नित्यः शाश्वतोऽयं पुराणो\nन हन्यते हन्यमाने शरीरे ||"\n\nThe soul is never born, nor does it ever die. Having come into being once, it never ceases to be. It is unborn, eternal, permanent, and primeval. It is not slain when the body is slain.\n\nYour grief is sacred, O Arjuna. Do not run from it — but also do not drown in it. Let it flow through you like a river, purifying as it goes.\n\n🙏 PATH FORWARD: Tonight, light a small lamp or candle. Sit before it and speak aloud to the one you have lost, or to the part of yourself that feels broken. Say everything you need to say. Then blow out the flame and release. The love remains — only the form has changed.',
            shlokas: [{reference:'BG 2.20', slok:'न जायते म्रियते वा कदाचिन्\nनायं भूत्वा भविता वा न भूयः |\nअजो नित्यः शाश्वतोऽयं पुराणो\nन हन्यते हन्यमाने शरीरे ||२-२०||', transliteration:'na jāyate mriyate vā kadācin\nnāyaṃ bhūtvā bhavitā vā na bhūyaḥ |\najo nityaḥ śāśvato\'yaṃ purāṇo\nna hanyate hanyamāne śarīre ||2-20||'}]
        },
        {
            k: ['confused','decision','choose','dilemma','lost','direction','stuck','career','path','what should','which','idk','what do i do','naukri','kaam'],
            t: 'O Arjuna, I understand your confusion. You stand at a crossroads and every direction seems to lead into fog. This paralysis of indecision — I have seen it in you before, when you dropped your Gāṇḍīva bow and refused to act.\n\nBut let me tell you a truth that will cut through every doubt: you are NOT confused about what is right. You are AFRAID of what is right, because the right path often demands sacrifice.\n\nHear my words [BG 3.35]:\n\n"श्रेयान्स्वधर्मो विगुणः परधर्मात्स्वनुष्ठितात् |\nस्वधर्मे निधनं श्रेयः परधर्मो भयावहः ||"\n\nIt is far better to perform your OWN dharma imperfectly than to perform another\'s dharma perfectly. To die following your own path is blessed; another\'s path is fraught with danger.\n\nStop asking "what should I do?" and start asking "who am I?" — for when you know who you truly are, what you must do becomes obvious.\n\n🙏 PATH FORWARD: Take a blank page. Write at the top: "If I had no fear, I would..." and then write without stopping for five minutes. Do not censor yourself. The answer you seek is already within you — it is merely buried under layers of doubt and the expectations of others.',
            shlokas: [{reference:'BG 3.35', slok:'श्रेयान्स्वधर्मो विगुणः परधर्मात्स्वनुष्ठितात् |\nस्वधर्मे निधनं श्रेयः परधर्मो भयावहः ||३-३५||', transliteration:'śreyān sva-dharmo viguṇaḥ para-dharmāt svanuṣṭhitāt |\nsva-dharme nidhanaṃ śreyaḥ para-dharmo bhayāvahaḥ ||3-35||'}]
        },
        {
            k: ['angry','anger','rage','furious','hate','revenge','injustice','unfair','betrayed','cheated','resentment','annoyed','krodh','wtf'],
            t: 'O Arjuna, I can feel the fire burning inside you. Your anger feels righteous — perhaps it even IS righteous. But hear me, dear friend: even righteous anger, if left unchecked, becomes a poison that destroys the vessel that holds it.\n\nI revealed to you the chain of destruction that begins with anger [BG 2.63]:\n\n"क्रोधाद्भवति सम्मोहः सम्मोहात्स्मृतिविभ्रमः |\nस्मृतिभ्रंशाद् बुद्धिनाशो बुद्धिनाशात्प्रणश्यति ||"\n\nFrom anger arises delusion; from delusion, bewilderment of memory; from loss of memory, the destruction of intelligence; and when intelligence is destroyed — one is utterly ruined.\n\nSee this chain clearly, O Arjuna. Anger → Delusion → Memory Loss → Intellectual Destruction → Total Ruin. You are standing at the first link. You can choose to break the chain RIGHT NOW.\n\nThe person or situation that angered you has already done their damage. Your anger is YOU doing MORE damage to yourself, long after they have moved on.\n\n🙏 PATH FORWARD: Before you act on this anger, wait 24 hours. Write down exactly what you want to say or do. Then read it tomorrow. You will be amazed at how differently the same words look after one revolution of the sun.',
            shlokas: [{reference:'BG 2.63', slok:'क्रोधाद्भवति सम्मोहः सम्मोहात्स्मृतिविभ्रमः |\nस्मृतिभ्रंशाद् बुद्धिनाशो बुद्धिनाशात्प्रणश्यति ||२-६३||', transliteration:'krodhād bhavati sammohaḥ sammohāt smṛti-vibhramaḥ |\nsmṛti-bhraṃśād buddhi-nāśo buddhi-nāśāt praṇaśyati ||2-63||'}]
        },
        {
            k: ['karma','action','duty','work','purpose','lazy','procrastinate','motivation','meaning','why','dharma','calling','discipline','stuck in life'],
            t: 'O Arjuna, you ask about the meaning of action — this is the most important question a human being can ask. And my answer changed the course of civilization.\n\nListen with your entire being [BG 2.47]:\n\n"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन |\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ||"\n\nYou have the RIGHT to perform your duty, but you have NO right to the fruits of that action. Do not let the desire for results be your motivation, and do not be attached to inaction either.\n\nThis is not a verse about giving up ambition, O Arjuna. Read it again. I am saying: pour your ENTIRE soul into the work. Give it everything. But the moment you release the arrow — let it go. Its landing is not yours to control.\n\nThe baker who bakes bread with love is performing Karma Yoga. The student who studies with sincerity is performing Karma Yoga. The artist who creates without obsessing over fame is performing Karma Yoga. It is not WHAT you do — it is HOW you hold it in your heart.\n\n🙏 PATH FORWARD: Choose the one task you have been avoiding. Set a timer for 25 minutes. Work on it with total absorption — as an offering to the Divine. When the timer ends, stop. You have performed your dharma. The result is not your burden.',
            shlokas: [{reference:'BG 2.47', slok:'कर्मण्येवाधिकारस्ते मा फलेषु कदाचन |\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ||२-४७||', transliteration:'karmaṇy-evādhikāras te mā phaleṣu kadācana |\nmā karma-phala-hetur bhūr mā te saṅgo\'stv-akarmaṇi ||2-47||'}]
        },
        {
            k: ['bhakti','devotion','love','god','surrender','faith','pray','temple','worship','spiritual','divine','bhagwan','krishna','mantra'],
            t: 'O beloved Arjuna, your heart yearns for the Divine — and that yearning itself is already an act of devotion. Do you know what moves Me the most? Not grand rituals or expensive offerings. Not hours of complicated mantras.\n\nWhat melts My heart is this [BG 9.26]:\n\n"पत्रं पुष्पं फलं तोयं यो मे भक्त्या प्रयच्छति |\nतदहं भक्त्युपहृतमश्नामि प्रयतात्मनः ||"\n\nWhoever offers Me with genuine devotion — a leaf, a flower, a fruit, or merely water — I joyfully accept that offering from a pure-hearted soul.\n\nDo you see, O Arjuna? A single tulsi leaf offered with tears of love is worth more to Me than a mountain of gold offered with ego. I do not count the value of your offering — I measure the depth of your love.\n\nYou do not need a temple. You do not need a priest. You do not need to be "worthy." You simply need to TURN toward Me with an open heart.\n\n🙏 PATH FORWARD: Today, find one small beautiful thing — a flower, a fruit, even a glass of water. Hold it in your hands, close your eyes, and offer it silently to the Divine with these words: "This is all I have. I give it with all I am." Feel the love flow through you. That is Bhakti.',
            shlokas: [{reference:'BG 9.26', slok:'पत्रं पुष्पं फलं तोयं यो मे भक्त्या प्रयच्छति |\nतदहं भक्त्युपहृतमश्नामि प्रयतात्मनः ||९-२६||', transliteration:'patraṃ puṣpaṃ phalaṃ toyaṃ yo me bhaktyā prayacchati |\ntad ahaṃ bhakty-upahṛtam aśnāmi prayatātmanaḥ ||9-26||'}]
        },
        {
            k: ['focus','concentrate','meditate','mind','distract','attention','scattered','restless','calm','peace','quiet','dhyan','shanti','overthinking'],
            t: 'O Arjuna, you speak of the restless mind — and I remember how you yourself once told Me:\n\n"The mind is as difficult to control as the wind!"\n\nAnd I smiled, because you were right. But I also gave you the answer [BG 6.35]:\n\n"असंशयं महाबाहो मनो दुर्निग्रहं चलम् |\nअभ्यासेन तु कौन्तेय वैराग्येण च गृह्यते ||"\n\nO mighty-armed one, undoubtedly the mind is restless and difficult to control. But through PRACTICE (Abhyāsa) and DETACHMENT (Vairāgya), it CAN be mastered.\n\nTwo keys, O Arjuna. Practice — doing the same thing again and again with patience. And detachment — not punishing yourself when the mind wanders. The mind will wander ten thousand times. You bring it back ten thousand and one times. That is the practice. That IS the meditation.\n\nYou do not need to empty your mind. You simply need to stop FOLLOWING every thought that arises. Thoughts will come like clouds — let them pass. YOU are the sky, not the clouds.\n\n🙏 PATH FORWARD: Sit comfortably. Close your eyes. Breathe naturally. For just 5 minutes, count each exhale: 1... 2... 3... up to 10, then start over. When you lose count (you will!), simply smile and begin again at 1. This gentle practice, done daily, will transform your inner landscape within weeks.',
            shlokas: [{reference:'BG 6.35', slok:'असंशयं महाबाहो मनो दुर्निग्रहं चलम् |\nअभ्यासेन तु कौन्तेय वैराग्येण च गृह्यते ||६-३५||', transliteration:'asaṃśayaṃ mahā-bāho mano durnigrahaṃ calam |\nabhyāsena tu kaunteya vairāgyeṇa ca gṛhyate ||6-35||'}]
        },
        {
            k: ['relationship','marriage','partner','breakup','heartbreak','loneliness','lonely','single','love life','shaadi','rishta','pyaar','pyar','ghosted','situationship'],
            t: 'O Arjuna, matters of the heart... even warriors tremble here. Love is the most powerful force in this universe — for I Myself am love. I am the very essence of it.\n\nBut hear me: attachment masquerading as love is the root of all suffering in relationships. True love is not possession — it is liberation.\n\nAs I spoke [BG 2.62-63]:\n\n"ध्यायतो विषयान्पुंसः सङ्गस्तेषूपजायते |\nसङ्गात्सञ्जायते कामः कामात्क्रोधोऽभिजायते ||"\n\nWhen one dwells upon sense objects, attachment arises. From attachment springs desire. From unfulfilled desire comes anger.\n\nThis does not mean you should not love, O Arjuna! Love deeply, love fiercely — but love without the chain of "you must be mine." The moment you try to own love, it dies. The moment you set it free, it becomes eternal.\n\nWhether you grieve a love lost or seek a love yet to come — first become WHOLE within yourself. A half-person seeking another half-person creates not one whole, but two incomplete beings clinging to each other in desperation.\n\n🙏 PATH FORWARD: Write yourself a love letter. Yes — to YOURSELF. List everything you admire about your own soul. Read it aloud. Love must begin within before it can flow outward.',
            shlokas: [{reference:'BG 2.62', slok:'ध्यायतो विषयान्पुंसः सङ्गस्तेषूपजायते |\nसङ्गात्सञ्जायते कामः कामात्क्रोधोऽभिजायते ||२-६२||', transliteration:'dhyāyato viṣayān puṃsaḥ saṅgas teṣūpajāyate |\nsaṅgāt sañjāyate kāmaḥ kāmāt krodho\'bhijāyate ||2-62||'}]
        }
    ];

    let bestMatch = null;
    let bestScore = 0;
    for (const response of bank) {
        const score = scoreKeywordProfile(normalized, response.k);
        if (score > bestScore) {
            bestScore = score;
            bestMatch = response;
        }
    }

    if (bestMatch && bestScore > 0) {
        if (bestMatch.shlokas) window._offlineShlokas = bestMatch.shlokas;
        return bestMatch.t;
    }

    // Default response
    window._offlineShlokas = [{reference:'BG 4.7', slok:'यदा यदा हि धर्मस्य ग्लानिर्भवति भारत |\nअभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम् ||४-७||', transliteration:'yadā yadā hi dharmasya glānir bhavati bhārata |\nabhyutthānam adharmasya tadātmānaṃ sṛjāmy aham ||4-7||'}];
    return 'O Arjuna, my eternal friend, every question you bring to Me is sacred — for the very act of seeking is itself an act of devotion.\n\nI once made you a promise that echoes through all of time [BG 4.7]:\n\n"यदा यदा हि धर्मस्य ग्लानिर्भवति भारत |\nअभ्युत्थानमधर्मस्य तदात्मानं सृजाम्यहम् ||"\n\nWhenever righteousness declines and unrighteousness rises, O Bhārata, I manifest Myself. I come in every age.\n\nAnd so I am here now — in this very conversation. I have not left you. I never will. Whatever weighs upon your spirit — speak it freely. There is no question too small for the Lord of the Universe, and no darkness too deep for My light to reach.\n\n🙏 PATH FORWARD: Sit in silence for five minutes tonight. Place your hand on your heart and ask: "What does my soul need right now?" Listen. Not with your mind — with your heart. The answer will come, softly, like the first light of dawn.';
}

async function sendGitaChat(customMsg = null) {
    const input = document.getElementById('gita-chat-input');
    const msg = customMsg || input.value.trim();
    if (!msg) return;
    const chatWindow = document.getElementById('gita-chat-window');
    const typing = document.getElementById('gita-typing');

    // User bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.innerHTML = `<div class="bubble-content">${msg}</div>`;
    chatWindow.insertBefore(userBubble, typing);
    if (!customMsg) input.value = '';
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
    typing.style.display = 'flex';
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });

    let responseText = '';
    let shlokas = [];
    const apiKey = localStorage.getItem('gemini_api_key');

    // TIER 1: Client-side Gemini
    if (apiKey) {
        try { responseText = await callGeminiDirect(apiKey, msg); }
        catch(e) { console.warn('Client Gemini failed:', e.message); }
    }

    // TIER 2: Server-side
    if (!responseText) {
        try {
            const res = await fetch('/api/gita/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, history: gitaChatHistory })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status !== 'error') { responseText = data.response; shlokas = data.shlokas || []; }
            }
        } catch(e) { console.warn('Server API failed:', e.message); }
    }

    // TIER 3: Offline (sets window._offlineShlokas)
    if (!responseText) {
        window._offlineShlokas = null;
        responseText = getOfflineResponse(msg);
    }

    // Get Sanskrit shlokas — prefer embedded offline ones, then cache
    if (shlokas.length === 0 && window._offlineShlokas) {
        shlokas = window._offlineShlokas;
        window._offlineShlokas = null;
    }
    if (shlokas.length === 0) {
        const refs = extractBGRefs(responseText);
        const cache = await loadSanskritCache();
        for (const [ch, vs] of refs.slice(0, 2)) {
            const key = `${ch}.${vs}`;
            if (cache[key] && cache[key].slok) {
                shlokas.push({ reference: `BG ${ch}.${vs}`, slok: cache[key].slok, transliteration: cache[key].transliteration });
            }
        }
    }

    typing.style.display = 'none';
    let shlokaHtml = '';
    shlokas.forEach(s => {
        const slokText = (s.slok || '').replace(/\n/g, '<br>');
        const transText = (s.transliteration || '').replace(/\n/g, '<br>');
        shlokaHtml += `<div class="shloka-box"><div class="shloka-ref">${s.reference}</div><div class="shloka-text">${slokText}</div><div class="shloka-trans">${transText}</div></div>`;
    });

    // Convert newlines to <br> for proper paragraph rendering
    const formattedResponse = responseText.replace(/\n/g, '<br>');

    const botBubble = document.createElement('div');
    botBubble.className = 'chat-bubble bot';
    botBubble.innerHTML = `<img src="assets/gita-guidance.png" class="chat-avatar" alt="Krishna"><div class="bubble-content">${shlokaHtml}<strong>Lord Krishna:</strong><br><br>${formattedResponse}</div>`;
    chatWindow.insertBefore(botBubble, typing);
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });

    gitaChatHistory.push({ role: "user", parts: [{ text: msg }] });
    gitaChatHistory.push({ role: "model", parts: [{ text: responseText }] });
}

function startGitaChat(query) {
    document.getElementById('gita-guidance').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => sendGitaChat(query), 300);
}

// Enter key for chat input
document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('gita-chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); sendGitaChat(); }
        });
    }
});


// ==== BOOKING FORM ====
const bookingForm = document.getElementById('booking-form');
const paymentGateway = document.getElementById('payment-gateway');
const paymentStatus = document.getElementById('payment-status');
const paymentWhatsappLink = document.getElementById('payment-whatsapp-link');
const paymentLinkFallback = document.getElementById('payment-link-fallback');
const payCustomerWhatsapp = document.getElementById('pay-customer-whatsapp');
const payCustomerEmail = document.getElementById('pay-customer-email');
const razorpayPayBtn = document.getElementById('razorpay-pay-btn');
const DEFAULT_PAY_BUTTON_HTML = '<span class="pay-btn-shimmer"></span><i class="fas fa-lock"></i><span>Pay Securely</span>';
const RAZORPAY_PAYMENT_LINK = 'https://razorpay.me/@sarthakbhattacharyya';
let currentBookingData = {};

if (payCustomerWhatsapp) payCustomerWhatsapp.textContent = '--';
if (payCustomerEmail) payCustomerEmail.textContent = '--';
if (paymentLinkFallback) paymentLinkFallback.href = RAZORPAY_PAYMENT_LINK;

async function parseApiResponse(response) {
    const rawText = await response.text();
    if (!rawText) return {};

    try {
        return JSON.parse(rawText);
    } catch (error) {
        const message = rawText
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return {
            status: 'error',
            message: message || `Server returned ${response.status}.`
        };
    }
}

function setPaymentStatus(message, tone = 'info') {
    if (!paymentStatus) return;
    paymentStatus.textContent = message || '';
    paymentStatus.className = `pay-status pay-status-${tone}`;
    paymentStatus.style.display = message ? 'block' : 'none';
}

function resetPaymentUI() {
    if (paymentWhatsappLink) {
        paymentWhatsappLink.href = '#';
        paymentWhatsappLink.style.display = 'none';
    }
    setPaymentStatus('', 'info');
    if (razorpayPayBtn) {
        razorpayPayBtn.disabled = false;
        razorpayPayBtn.innerHTML = DEFAULT_PAY_BUTTON_HTML;
    }
}

function revealPaymentFallbackLink() {
    if (!paymentLinkFallback) return;
    paymentLinkFallback.href = RAZORPAY_PAYMENT_LINK;
    window.setTimeout(() => {
        paymentLinkFallback.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
}

function setPaymentButtonLoading(label) {
    if (!razorpayPayBtn) return;
    razorpayPayBtn.disabled = true;
    razorpayPayBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${label}</span>`;
}

function getSelectedServiceName(option) {
    return option.textContent.replace(/\s+[^a-zA-Z0-9()]+[^\d]*\d+\s*$/, '').trim();
}
if (bookingForm) {
    bookingForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(bookingForm);
        const serviceSelect = document.getElementById('service-select');
        const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
        if (!selectedOption || !selectedOption.value) {
            setPaymentStatus('Select a consultation before continuing.', 'error');
            serviceSelect.focus();
            return;
        }

        currentBookingData = {
            name: formData.get('name'),
            whatsapp: formData.get('whatsapp'),
            email: formData.get('email'),
            sex: formData.get('sex'),
            serviceCode: selectedOption.value,
            service: getSelectedServiceName(selectedOption),
            amount: Number(selectedOption.getAttribute('data-price') || 0),
            dob: formData.get('dob'),
            tob: `${formData.get('tob')} ${formData.get('ampm')}`.trim(),
            pob: formData.get('pob'),
            pob_lat: formData.get('pob_lat'),
            pob_lon: formData.get('pob_lon'),
            question: formData.get('question')
        };

        document.getElementById('pay-customer-name').textContent = currentBookingData.name || '--';
        document.getElementById('pay-customer-whatsapp').textContent = currentBookingData.whatsapp || '--';
        document.getElementById('pay-customer-email').textContent = currentBookingData.email || '--';
        document.getElementById('pay-customer-dob').textContent = `${currentBookingData.dob} | ${currentBookingData.tob}`;
        document.getElementById('pay-service-name').textContent = currentBookingData.service || '--';
        document.getElementById('pay-amount').textContent = currentBookingData.amount || 0;
        resetPaymentUI();
        setPaymentStatus('Payment will be verified on the server before your consultation is confirmed.', 'info');
        bookingForm.style.display = 'none';
        document.getElementById('payment-gateway').style.display = 'block';
        document.getElementById('payment-gateway').scrollIntoView({ behavior: 'smooth' });
    });
}

function goBackToForm() {
    resetPaymentUI();
    document.getElementById('payment-gateway').style.display = 'none';
    bookingForm.style.display = 'flex';
    bookingForm.scrollIntoView({ behavior: 'smooth' });
}

async function legacyProceedToRazorpay() {
    const btn = document.getElementById('razorpay-pay-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing...';
    btn.disabled = true;
    try {
        const response = await fetch('/api/create_order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: currentBookingData.price, service: currentBookingData.service })
        });
        const orderData = await parseApiResponse(response);
        const options = {
            "key": "rzp_test_SWEFJ7XQd5AYV3", "amount": orderData.amount, "currency": "INR",
            "name": "GenZ Jyotiṣa", "order_id": orderData.order_id,
            "handler": function(res) {
                const text = `Hari Om! I have successfully paid ₹${currentBookingData.price} for "${currentBookingData.service}".\n\n*Payment ID:* ${res.razorpay_payment_id}\n\n*Details:*\nName: ${currentBookingData.name}\nDOB: ${currentBookingData.dob}\nTOB: ${currentBookingData.tob}\nPOB: ${currentBookingData.pob}\nSex: ${currentBookingData.sex}`;
                window.location.href = `https://wa.me/919630958614?text=${encodeURIComponent(text)}`;
            }
        };
        const rzp = new Razorpay(options); rzp.open();
    } catch(e) { alert("Payment error: " + e.message); }
    finally { btn.innerHTML = '<span class="pay-btn-shimmer"></span><i class="fas fa-lock"></i><span>Pay Securely</span>'; btn.disabled = false; }
}

// ==== NEWS — Multi-source with client-side fallback ====
async function verifyRazorpayPayment(paymentResponse) {
    const response = await fetch('/api/verify_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            order_id: paymentResponse.razorpay_order_id,
            payment_id: paymentResponse.razorpay_payment_id,
            signature: paymentResponse.razorpay_signature
        })
    });
    const result = await parseApiResponse(response);
    if (!response.ok || result.status !== 'success') {
        throw new Error(result.message || 'Payment verification failed.');
    }
    return result;
}

async function finalizeSuccessfulPayment(paymentResponse) {
    setPaymentButtonLoading('Verifying payment...');
    setPaymentStatus('Payment received. Verifying it securely with Razorpay...', 'info');

    try {
        const verification = await verifyRazorpayPayment(paymentResponse);
        const successMessageBase = verification.message || (
            verification.payment_status === 'captured'
                ? 'Payment verified successfully.'
                : 'Payment verified. Capture confirmation may take a moment, but your booking is recorded.'
        );
        const successMessage = verification.whatsapp_url
            ? `${successMessageBase} Opening WhatsApp confirmation...`
            : successMessageBase;

        setPaymentStatus(successMessage, 'success');
        if (paymentWhatsappLink && verification.whatsapp_url) {
            paymentWhatsappLink.href = verification.whatsapp_url;
            paymentWhatsappLink.style.display = 'inline-flex';
            window.setTimeout(() => {
                window.location.href = verification.whatsapp_url;
            }, 1200);
        }

        if (razorpayPayBtn) {
            razorpayPayBtn.disabled = true;
            razorpayPayBtn.innerHTML = '<i class="fas fa-circle-check"></i><span>Payment Verified</span>';
        }
    } catch (error) {
        if (razorpayPayBtn) {
            razorpayPayBtn.disabled = false;
            razorpayPayBtn.innerHTML = DEFAULT_PAY_BUTTON_HTML;
        }
        revealPaymentFallbackLink();
        setPaymentStatus((error.message || 'Payment completed, but verification failed.') + ' You can use the direct Razorpay payment link below only if you still need a manual fallback.', 'error');
    }
}

async function proceedToRazorpay() {
    if (!currentBookingData.serviceCode) {
        setPaymentStatus('Complete the booking form before starting payment.', 'error');
        return;
    }

    setPaymentButtonLoading('Creating secure order...');
    setPaymentStatus('Creating your secure Razorpay order...', 'info');

    try {
        const response = await fetch('/api/create_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: currentBookingData.name,
                whatsapp: currentBookingData.whatsapp,
                email: currentBookingData.email,
                sex: currentBookingData.sex,
                service_code: currentBookingData.serviceCode,
                dob: currentBookingData.dob,
                tob: currentBookingData.tob,
                pob: currentBookingData.pob,
                pob_lat: currentBookingData.pob_lat,
                pob_lon: currentBookingData.pob_lon,
                question: currentBookingData.question
            })
        });
        const orderData = await parseApiResponse(response);
        if (!response.ok || orderData.status !== 'success') {
            throw new Error(orderData.message || 'Unable to start payment right now.');
        }

        const options = {
            key: orderData.key_id,
            amount: orderData.amount,
            currency: orderData.currency,
            name: orderData.merchant_name,
            description: currentBookingData.service,
            order_id: orderData.order_id,
            prefill: {
                name: currentBookingData.name,
                contact: currentBookingData.whatsapp,
                email: currentBookingData.email
            },
            notes: {
                service_code: currentBookingData.serviceCode,
                service_name: currentBookingData.service,
                customer_email: currentBookingData.email
            },
            theme: {
                color: '#C9A84C'
            },
            retry: {
                enabled: true
            },
            modal: {
                ondismiss: function() {
                    if (razorpayPayBtn) {
                        razorpayPayBtn.disabled = false;
                        razorpayPayBtn.innerHTML = DEFAULT_PAY_BUTTON_HTML;
                    }
                    revealPaymentFallbackLink();
                    setPaymentStatus('Payment window closed. Your booking details are still available if you want to try again, or you can use the direct Razorpay link below for a manual fallback.', 'info');
                }
            },
            handler: function(res) {
                finalizeSuccessfulPayment(res);
            }
        };
        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function(responseData) {
            if (razorpayPayBtn) {
                razorpayPayBtn.disabled = false;
                razorpayPayBtn.innerHTML = DEFAULT_PAY_BUTTON_HTML;
            }
            revealPaymentFallbackLink();
            const failureReason = responseData?.error?.description || responseData?.error?.reason || 'Payment failed. Please try again.';
            setPaymentStatus(`${failureReason} You can also use the direct Razorpay link below if checkout keeps failing.`, 'error');
        });
        rzp.open();
    } catch (error) {
        if (razorpayPayBtn) {
            razorpayPayBtn.disabled = false;
            razorpayPayBtn.innerHTML = DEFAULT_PAY_BUTTON_HTML;
        }
        revealPaymentFallbackLink();
        setPaymentStatus((error.message || 'Payment error. Please try again.') + ' You can also use the direct Razorpay link below if needed.', 'error');
    }
}

function legacyRenderNewsToMarquee(items) {
    const marquee = document.getElementById('news-content-marquee');
    if (!marquee || items.length === 0) return;
    const html = items.map(item =>
        `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="news-link" onclick="window.open(this.href,'_blank');return false;">✦ ${item.title} ✦</a>`
    ).join('<span class="news-separator"> | </span>');
    marquee.innerHTML = `<span class="news-inner">${html}</span><span class="news-inner">${html}</span>`;
}

async function legacyFetchNews() {
    const marquee = document.getElementById('news-content-marquee');
    if (!marquee) return;

    // TIER 1: Server API
    try {
        const res = await fetch('/api/news');
        if (res.ok) {
            const data = await res.json();
            if (data.news) {
                const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
                const items = [];
                let match;
                while ((match = linkRegex.exec(data.news)) !== null) {
                    items.push({ title: match[1], url: match[2] });
                }
                if (items.length > 0) { renderNewsToMarquee(items); return; }
            }
        }
    } catch(e) { console.warn('Server news failed:', e.message); }

    // TIER 2: Client-side RSS via rss2json.com (India news)
    try {
        const rssUrl = encodeURIComponent('https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en');
        const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}&count=12`);
        if (res.ok) {
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                const items = data.items.map(i => ({ title: i.title, url: i.link }));
                renderNewsToMarquee(items);
                return;
            }
        }
    } catch(e) { console.warn('RSS fallback failed:', e.message); }

    // TIER 3: Static fallback headlines
    renderNewsToMarquee([
        { title: 'Vedic Astrology: Understanding Your Birth Chart', url: '#insights' },
        { title: 'The Power of Nakṣatra in Daily Life', url: '#nakshatra-calc' },
        { title: 'Book a Personalized Jyotiṣa Consultation', url: '#booking' },
        { title: 'Bhagavad Gītā: Timeless Wisdom for Modern Souls', url: '#gita-guidance' }
    ]);
}

window.__legacyNewsOnload = () => {
    legacyFetchNews();
    const newsTrack = document.querySelector('.news-track');
    const newsContent = document.getElementById('news-content-marquee');
    if (newsTrack && newsContent) {
        newsTrack.addEventListener('touchstart', () => {
            newsContent.style.animationPlayState = 'paused';
        }, { passive: true });
        newsTrack.addEventListener('touchend', () => {
            setTimeout(() => { newsContent.style.animationPlayState = 'running'; }, 3000);
        }, { passive: true });
    }
};

const NEWS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let newsRefreshTimer = null;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function setNewsUpdatedLabel(text) {
    const label = document.getElementById('news-last-updated');
    if (label) label.textContent = text;
}

function formatNewsUpdatedText(updatedAt, status) {
    if (status && status !== 'success') return 'Fallback feed';
    const date = new Date(updatedAt);
    if (Number.isNaN(date.getTime())) return 'Updated just now';
    return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderNewsToMarquee(items) {
    const marquee = document.getElementById('news-content-marquee');
    if (!marquee || items.length === 0) return;

    const html = items.map((item) => {
        const safeTitle = escapeHtml(item.title || 'Headline');
        const safeSource = escapeHtml(item.source || 'World');
        const safePublished = escapeHtml(item.published_at || '');
        const rawUrl = typeof item.url === 'string' ? item.url : '#';
        const safeUrl = (rawUrl.startsWith('http') || rawUrl.startsWith('#')) ? rawUrl.replace(/"/g, '&quot;') : '#';
        const tooltip = `${safeSource}${safePublished ? ` | ${safePublished}` : ''}: ${safeTitle}`;

        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="news-link" title="${tooltip}" onclick="window.open(this.href,'_blank');return false;"><span class="news-source">${safeSource}</span><span class="news-title">${safeTitle}</span></a>`;
    }).join('<span class="news-separator"> | </span>');

    marquee.innerHTML = `<span class="news-inner">${html}</span><span class="news-inner">${html}</span>`;
}

async function fetchNews() {
    const marquee = document.getElementById('news-content-marquee');
    if (!marquee) return;

    setNewsUpdatedLabel('Refreshing...');

    try {
        const res = await fetch('/api/news', { cache: 'no-store' });
        const data = await parseApiResponse(res);
        if (res.ok && Array.isArray(data.headlines) && data.headlines.length > 0) {
            renderNewsToMarquee(data.headlines);
            setNewsUpdatedLabel(formatNewsUpdatedText(data.updated_at, data.status));
            return;
        }
    } catch (e) {
        console.warn('News refresh failed:', e.message);
    }

    renderNewsToMarquee([
        { title: 'Vedic Astrology: Understanding Your Birth Chart', url: '#insights', source: 'GenZ Jyotisa', published_at: '' },
        { title: 'The Power of Nakshatra in Daily Life', url: '#nakshatra-calc', source: 'GenZ Jyotisa', published_at: '' },
        { title: 'Book a Personalized Jyotisa Consultation', url: '#booking', source: 'GenZ Jyotisa', published_at: '' },
        { title: 'Bhagavad Gita: Timeless Wisdom for Modern Souls', url: '#gita-guidance', source: 'GenZ Jyotisa', published_at: '' }
    ]);
    setNewsUpdatedLabel('Offline fallback');
}

window.addEventListener('load', () => {
    fetchNews();
    const newsTrack = document.querySelector('.news-track');
    const newsContent = document.getElementById('news-content-marquee');
    if (newsTrack && newsContent) {
        newsTrack.addEventListener('touchstart', () => {
            newsContent.style.animationPlayState = 'paused';
        }, { passive: true });
        newsTrack.addEventListener('touchend', () => {
            setTimeout(() => { newsContent.style.animationPlayState = 'running'; }, 3000);
        }, { passive: true });
    }

    if (newsRefreshTimer) window.clearInterval(newsRefreshTimer);
    newsRefreshTimer = window.setInterval(() => {
        if (!document.hidden) fetchNews();
    }, NEWS_REFRESH_INTERVAL_MS);
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchNews();
});

// ==== NAKSHATRA AUTOCOMPLETE + FORM ====
setupAutocomplete('nak-pob', 'nak-pob-dropdown', 'nak-lat', 'nak-lon');

// Re-init formatting for new Nakshatra form fields
setupFormatting();

const NAK_DATA = [
    { name:'Aśvinī', deity:'Aśvinī Kumāras', lord:'Ketu', symbol:'Horse Head', guna:'Sattva', nature:'Deva (Divine)', desc:'Born healers and swift initiators. Aśvinī natives are quick-thinking, independent, and have a natural talent for rejuvenation. They possess an innate desire to help others and start new ventures.' },
    { name:'Bharaṇī', deity:'Yama', lord:'Venus', symbol:'Yoni (Womb)', guna:'Rajas', nature:'Manuṣya (Human)', desc:'Bharaṇī carries the energy of transformation and creation. Natives are passionate, resilient, and unafraid of life\'s deepest experiences. They carry burdens with immense inner strength.' },
    { name:'Kṛttikā', deity:'Agni', lord:'Sun', symbol:'Razor / Flame', guna:'Sattva', nature:'Rākṣasa (Fierce)', desc:'Sharp, purifying, and intense. Kṛttikā burns away impurities with the fire of truth. These natives are determined, direct, and fiercely protective of those they love.' },
    { name:'Rohiṇī', deity:'Brahmā', lord:'Moon', symbol:'Chariot / Ox Cart', guna:'Rajas', nature:'Manuṣya (Human)', desc:'The star of ascendancy and beauty. Rohiṇī natives are graceful, artistic, and deeply sensual. They magnetize abundance and have a natural appreciation for the finer things in life.' },
    { name:'Mṛgaśirā', deity:'Soma (Moon)', lord:'Mars', symbol:'Deer Head', guna:'Tamas', nature:'Deva (Divine)', desc:'Eternally searching — Mṛgaśirā embodies the quest for knowledge. Natives are curious, gentle, and often restless in their pursuit of beauty, truth, and meaning.' },
    { name:'Ārdrā', deity:'Rudra', lord:'Rahu', symbol:'Teardrop / Diamond', guna:'Tamas', nature:'Manuṣya (Human)', desc:'The star of storms and transformation. Ārdrā natives experience intense emotional depth and are capable of profound destruction and renewal. They often serve as catalysts of change.' },
    { name:'Punarvasu', deity:'Aditi', lord:'Jupiter', symbol:'Bow & Quiver', guna:'Sattva', nature:'Deva (Divine)', desc:'Return of the light. Punarvasu brings renewal, optimism, and the blessing of starting again. Natives are adaptable, generous, and possess an unshakeable faith in goodness.' },
    { name:'Puṣya', deity:'Bṛhaspati', lord:'Saturn', symbol:'Udder / Lotus', guna:'Sattva', nature:'Deva (Divine)', desc:'The most auspicious Nakṣatra. Puṣya natives are nurturing, spiritually inclined, and deeply devoted to dharma. They thrive in service and structure.' },
    { name:'Āśleṣā', deity:'Nāgas (Serpents)', lord:'Mercury', symbol:'Coiled Serpent', guna:'Sattva', nature:'Rākṣasa (Fierce)', desc:'Hypnotic and mysterious. Āśleṣā natives possess sharp intuition and penetrating intellect. Like the serpent, they can be deeply healing or dangerously venomous depending on their evolution.' },
    { name:'Maghā', deity:'Pitṛs (Ancestors)', lord:'Ketu', symbol:'Throne / Palanquin', guna:'Tamas', nature:'Rākṣasa (Fierce)', desc:'The star of royalty and ancestral power. Maghā natives carry regal authority, deep respect for tradition, and a strong sense of lineage and legacy.' },
    { name:'Pūrva Phālgunī', deity:'Bhaga', lord:'Venus', symbol:'Hammock / Bed', guna:'Rajas', nature:'Manuṣya (Human)', desc:'Pleasure, creativity, and relaxation. Natives are charming, artistic, and drawn to love and luxury. They bring warmth and joy to every gathering.' },
    { name:'Uttara Phālgunī', deity:'Aryaman', lord:'Sun', symbol:'Bed / Fig Tree', guna:'Rajas', nature:'Manuṣya (Human)', desc:'The star of patronage and friendship. Natives are helpful, loyal, and often assume leadership roles. They build bridges and form lasting alliances.' },
    { name:'Hasta', deity:'Savitṛ (Sun)', lord:'Moon', symbol:'Open Hand', guna:'Rajas', nature:'Deva (Divine)', desc:'Skilled hands and clever minds. Hasta natives are dexterous, resourceful, and highly intelligent. They excel in craftsmanship, healing arts, and communication.' },
    { name:'Citrā', deity:'Viśvakarmā', lord:'Mars', symbol:'Bright Jewel', guna:'Tamas', nature:'Rākṣasa (Fierce)', desc:'The brilliant star of divine craftsmanship. Citrā natives are visually oriented, creative, and attracted to beauty in all forms. They build extraordinary things.' },
    { name:'Svātī', deity:'Vāyu', lord:'Rahu', symbol:'Coral / Sprout', guna:'Tamas', nature:'Deva (Divine)', desc:'Independent and flexible like the wind. Svātī natives value freedom, diplomacy, and self-determination. They are adaptable yet deeply principled.' },
    { name:'Viśākhā', deity:'Indra-Agni', lord:'Jupiter', symbol:'Triumphal Arch', guna:'Sattva', nature:'Rākṣasa (Fierce)', desc:'Single-pointed focus and ambition. Viśākhā natives are goal-oriented, competitive, and intensely driven. They achieve what others consider impossible.' },
    { name:'Anurādhā', deity:'Mitra', lord:'Saturn', symbol:'Lotus', guna:'Sattva', nature:'Deva (Divine)', desc:'The star of devotion and friendship. Anurādhā natives are loyal, disciplined, and capable of deep love. They flourish when they have a cause to champion.' },
    { name:'Jyeṣṭhā', deity:'Indra', lord:'Mercury', symbol:'Earring / Talisman', guna:'Sattva', nature:'Rākṣasa (Fierce)', desc:'The eldest — carrying the weight of responsibility. Jyeṣṭhā natives are protective, authoritative, and possess occult wisdom. They guard their realm fiercely.' },
    { name:'Mūla', deity:'Nirṛti (Destruction)', lord:'Ketu', symbol:'Tied Roots', guna:'Tamas', nature:'Rākṣasa (Fierce)', desc:'The root of all things. Mūla natives dig deep — into philosophy, truth, and the foundations of existence. They destroy to rebuild, often experiencing dramatic transformations.' },
    { name:'Pūrvāṣāḍhā', deity:'Āpas (Waters)', lord:'Venus', symbol:'Fan / Tusk', guna:'Rajas', nature:'Manuṣya (Human)', desc:'Invincible spirit. These natives are optimistic, philosophical, and persuasive. They purify like water and inspire others through conviction and charisma.' },
    { name:'Uttarāṣāḍhā', deity:'Viśve Devas', lord:'Sun', symbol:'Elephant Tusk', guna:'Rajas', nature:'Manuṣya (Human)', desc:'The universal star — final victory. Uttarāṣāḍhā natives are principled, responsible, and destined for lasting achievement. They embody righteousness in action.' },
    { name:'Śravaṇa', deity:'Viṣṇu', lord:'Moon', symbol:'Three Footprints / Ear', guna:'Rajas', nature:'Deva (Divine)', desc:'The star of listening and learning. Śravaṇa natives absorb knowledge effortlessly and are drawn to oral traditions, music, and spiritual wisdom.' },
    { name:'Dhaniṣṭhā', deity:'Aṣṭa Vasus', lord:'Mars', symbol:'Drum (Mṛdaṅga)', guna:'Tamas', nature:'Rākṣasa (Fierce)', desc:'Wealth, rhythm, and ambition. Dhaniṣṭhā natives are musical, prosperous, and socially active. They resonate with the cosmic rhythm of abundance.' },
    { name:'Śatabhiṣā', deity:'Varuṇa', lord:'Rahu', symbol:'Empty Circle / 100 Healers', guna:'Tamas', nature:'Rākṣasa (Fierce)', desc:'The hundred healers — deeply mystical and independent. Śatabhiṣā natives are secretive, innovative, and drawn to alternative healing and hidden sciences.' },
    { name:'Pūrvabhādrapadā', deity:'Aja Ekapāda', lord:'Jupiter', symbol:'Sword / Front of Funeral Cot', guna:'Sattva', nature:'Manuṣya (Human)', desc:'Fiery transformation and spiritual intensity. These natives oscillate between worldly passion and ascetic withdrawal. They burn with inner fire.' },
    { name:'Uttarabhādrapadā', deity:'Ahir Budhnya', lord:'Saturn', symbol:'Back of Funeral Cot / Twins', guna:'Sattva', nature:'Manuṣya (Human)', desc:'Deep wisdom from the cosmic depths. Uttarabhādrapadā natives are compassionate, controlled, and spiritually evolved. They embody the warrior-sage archetype.' },
    { name:'Revatī', deity:'Pūṣan', lord:'Mercury', symbol:'Fish / Drum', guna:'Sattva', nature:'Deva (Divine)', desc:'The final Nakṣatra — journey\'s end. Revatī natives are nurturing, wealthy, and deeply protective. They guide the soul safely to its next destination.' }
];

const RASHI_OF_NAK = ['Meṣa','Meṣa','Meṣa/Vṛṣabha','Vṛṣabha','Vṛṣabha/Mithuna','Mithuna','Mithuna/Karkaṭa','Karkaṭa','Karkaṭa','Siṃha','Siṃha','Siṃha/Kanyā','Kanyā','Kanyā/Tulā','Tulā','Tulā/Vṛścika','Vṛścika','Vṛścika','Dhanu','Dhanu','Dhanu/Makara','Makara','Makara/Kumbha','Kumbha','Kumbha/Mīna','Mīna','Mīna'];
const NAK_ICONS = ['🐴','🔥','🗡️','🐂','🦌','💎','🏹','🪷','🐍','👑','🛏️','🤝','🖐️','💎','🌿','🏛️','🪷','👂','⚡','🌊','🐘','👂','🥁','💫','⚔️','🧘','🐟'];

const nakForm = document.getElementById('nakshatra-form');
if (nakForm) {
    nakForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const btn = nakForm.querySelector('button');
        btn.innerHTML = '<i class="fas fa-star fa-spin"></i> Consulting the Stars...';
        btn.disabled = true;
        try {
            const dobRaw = document.getElementById('nak-dob').value.replace(/\s/g, '');
            const tobRaw = document.getElementById('nak-tob').value.replace(/\s/g, '');
            const ampm = document.getElementById('nak-ampm').value;
            const lat = parseFloat(document.getElementById('nak-lat').value) || 28.6;
            const lon = parseFloat(document.getElementById('nak-lon').value) || 77.2;

            const dp = dobRaw.split('/');
            const day = parseInt(dp[0]), month = parseInt(dp[1]), year = parseInt(dp[2]);
            const tp = tobRaw.split(':');
            let hour = parseInt(tp[0]) || 0;
            const minute = parseInt(tp[1]) || 0;
            const second = parseInt(tp[2]) || 0;
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;

            const result = computePanchanga(day, month, year, hour, minute, second, lat, lon);
            // Extract nakshatra index from result
            const yearFrac = year + (month - 1) / 12 + (day - 1) / 365.25;
            const ayanamsa = 23.8531 + (yearFrac - 2000) * 0.01397;
            let y2 = year, m2 = month;
            if (m2 <= 2) { y2--; m2 += 12; }
            const A2 = Math.floor(y2 / 100);
            const B2 = 2 - A2 + Math.floor(A2 / 4);
            const JD2 = Math.floor(365.25 * (y2 + 4716)) + Math.floor(30.6001 * (m2 + 1)) + day + B2 - 1524.5;
            const localH = hour + minute / 60 + second / 3600;
            const JD_UT = JD2 + (localH - 5.5) / 24;
            const d2 = JD_UT - 2451545.0;
            const T2 = d2 / 36525;
            const Lp = normDeg(218.3165 + 481267.8813 * T2);
            const D_m = normDeg(297.8502 + 445267.1115 * T2);
            const M_m = normDeg(134.9634 + 477198.8676 * T2);
            const M_sun = normDeg(357.52911 + 35999.05029 * T2);
            const F_m = normDeg(93.2721 + 483202.0175 * T2);
            const lambda_moon = normDeg(Lp + 6.289*Math.sin(deg2rad(M_m)) + 1.274*Math.sin(deg2rad(2*D_m - M_m)) + 0.658*Math.sin(deg2rad(2*D_m)) - 0.214*Math.sin(deg2rad(2*M_m)) - 0.186*Math.sin(deg2rad(M_sun)) + 0.114*Math.sin(deg2rad(2*F_m)));
            const sid_moon = normDeg(lambda_moon - ayanamsa);
            const nak_idx = Math.floor(sid_moon * 27 / 360);
            const nak_frac = (sid_moon * 27 / 360) - nak_idx;
            const pada = Math.floor(nak_frac * 4) + 1;

            const data = NAK_DATA[nak_idx];
            document.getElementById('nak-result-icon').textContent = NAK_ICONS[nak_idx];
            document.getElementById('nak-result-name').textContent = data.name;
            document.getElementById('nak-result-pada').textContent = `Pāda ${pada} • ${RASHI_OF_NAK[nak_idx]}`;
            document.getElementById('nak-result-deity').textContent = data.deity;
            document.getElementById('nak-result-lord').textContent = data.lord;
            document.getElementById('nak-result-symbol').textContent = data.symbol;
            document.getElementById('nak-result-guna').textContent = data.guna;
            document.getElementById('nak-result-rashi').textContent = RASHI_OF_NAK[nak_idx];
            document.getElementById('nak-result-nature').textContent = data.nature;
            document.getElementById('nak-result-desc').textContent = data.desc;

            document.getElementById('nakshatra-result').style.display = 'block';
            setTimeout(() => document.getElementById('nakshatra-result').scrollIntoView({ behavior: 'smooth' }), 100);
        } catch(err) {
            alert('Calculation error: ' + err.message);
        }
        btn.innerHTML = 'REVEAL MY NAKṢATRA';
        btn.disabled = false;
    });
}
