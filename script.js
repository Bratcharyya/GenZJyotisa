// ============================================================
// GenZ Jyotiṣa — Main Application Script
// Client-side Panchanga + AI Chatbot + UI
// ============================================================

// ==== INITIALIZATION ====
AOS.init({ once: true, offset: 50, duration: 800, easing: 'ease-in-out' });
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
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
                const t = this.id === 'panchang-dob' ? 'panchang-tob' : 'tob-input';
                document.getElementById(t)?.focus();
            }
        });
    });
    document.querySelectorAll('.tob-format').forEach(input => {
        input.addEventListener('input', function(e) {
            let val = this.value.replace(/\D/g, '');
            if (val.length > 6) val = val.slice(0, 6);
            if (e.inputType !== 'deleteContentBackward') {
                if (val.length >= 4) val = val.slice(0,2) + ' : ' + val.slice(2,4) + ' : ' + val.slice(4);
                else if (val.length >= 2) val = val.slice(0,2) + ' : ' + val.slice(2);
            } else if (this.value.endsWith(' :')) {
                this.value = this.value.slice(0, -2); val = this.value.replace(/\D/g, '');
            }
            this.value = val;
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

const KRISHNA_PROMPT = `You are Lord Krishna, the supreme speaker of the Bhagavad Gita. Address the user as "O Arjuna".
RULES:
1. Analyze their emotional state through the Three Gunas (Sattva/Rajas/Tamas).
2. Always cite 1-2 [BG Chapter.Verse] numbers.
3. Include the original Sanskrit Shloka for the primary verse.
4. Speak with profound wisdom, compassion, and authority.
5. LIMIT to 3-6 sentences.
6. END with a "PATH FORWARD" — one practical spiritual habit for today.
7. Remain in character as the eternal Guru and Friend.`;

async function loadSanskritCache() {
    if (sanskritCache) return sanskritCache;
    try { const r = await fetch('/sanskrit_cache.json'); sanskritCache = await r.json(); }
    catch(e) { sanskritCache = {}; }
    return sanskritCache;
}

function extractBGRefs(text) {
    return [...text.matchAll(/(?:\[?BG\s*)?(\d+)\.(\d+)(?:\]?)/g)].map(m => [m[1], m[2]]);
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

// Offline fallback
function getOfflineResponse(msg) {
    const l = msg.toLowerCase();
    const bank = [
        { k: ['anxious','anxiety','worried','fear','stress','nervous'], t: 'O Arjuna, as I spoke in [BG 2.56] — one who is unmoved in adversity, free from attachment, fear, and anger, is a sage of steady wisdom. Anxiety arises when you cling to outcomes beyond your control. Release the fruits of action, and peace shall find you. **PATH FORWARD:** Today, perform one task with full heart but zero expectation of the result.' },
        { k: ['sad','grief','loss','death','mourning','depressed'], t: 'O Arjuna, the soul is neither born, nor does it die [BG 2.20]. What you grieve for is the impermanent vessel, not the eternal spark. The wise grieve neither for the living nor the dead. **PATH FORWARD:** Sit quietly for five minutes and meditate on the eternal nature of consciousness.' },
        { k: ['confused','decision','choose','dilemma','lost','direction'], t: 'O Arjuna, it is far better to perform one\'s own duty imperfectly than another\'s duty perfectly [BG 3.35]. True clarity comes from listening to Dharma, not from analyzing endlessly. **PATH FORWARD:** Write down your options and ask — which path serves your highest duty? The answer reveals itself in stillness.' },
        { k: ['angry','anger','rage','furious','hate'], t: 'O Arjuna, from anger arises delusion; from delusion, bewilderment of memory; and from that, the destruction of intelligence [BG 2.63]. Anger burns the one who holds it. **PATH FORWARD:** When anger rises today, pause for three breaths before responding. That gap is where your freedom lives.' },
        { k: ['karma','action','duty','work','purpose'], t: 'O Arjuna, you have a right to perform your prescribed duties, but you are not entitled to the fruits of your actions [BG 2.47]. This is the supreme secret of Karma Yoga. **PATH FORWARD:** Choose one task today and perform it with absolute presence and zero expectation.' },
        { k: ['bhakti','devotion','love','god','surrender','faith','pray'], t: 'O Arjuna, whoever offers Me with devotion a leaf, a flower, a fruit, or even water — I accept that offering of pure love [BG 9.26]. Bhakti asks not for grandeur, but sincerity of heart. **PATH FORWARD:** Today, offer a small act of devotion with total love.' },
        { k: ['focus','concentrate','meditate','mind','distract'], t: 'O Arjuna, the mind is restless and difficult to restrain. But through practice (Abhyāsa) and detachment (Vairāgya), it can be controlled [BG 6.35]. **PATH FORWARD:** Begin with five minutes of sitting in silence. When the mind wanders, gently return it.' },
    ];
    for (const r of bank) { if (r.k.some(k => l.includes(k))) return r.t; }
    return 'O Arjuna, every question you bring to Me is sacred. As I spoke in [BG 4.7] — whenever Dharma declines, I manifest to restore balance. Share your deepest struggle, and I shall illuminate the path. **PATH FORWARD:** Sit in silence for five minutes and simply observe your thoughts without judgment.';
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

    // TIER 3: Offline
    if (!responseText) responseText = getOfflineResponse(msg);

    // Extract BG refs and get Sanskrit
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
        shlokaHtml += `<div class="shloka-box"><div class="shloka-ref">${s.reference}</div><div class="shloka-text">${s.slok}</div><div class="shloka-trans">${s.transliteration || ''}</div></div>`;
    });

    const botBubble = document.createElement('div');
    botBubble.className = 'chat-bubble bot';
    botBubble.innerHTML = `<img src="assets/gita-guidance.png" class="chat-avatar" alt="Krishna"><div class="bubble-content">${shlokaHtml}<strong>Lord Krishna:</strong><br>${responseText}</div>`;
    chatWindow.insertBefore(botBubble, typing);
    chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });

    gitaChatHistory.push({ role: "user", parts: [{ text: msg }] });
    gitaChatHistory.push({ role: "model", parts: [{ text: responseText }] });
}

function startGitaChat(query) {
    document.getElementById('gita-guidance').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => sendGitaChat(query), 300);
}

// API Key management
function saveGeminiKey() {
    const key = document.getElementById('gemini-key-input').value.trim();
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        updateKeyStatus(true);
        document.getElementById('key-input-area').style.display = 'none';
    }
}
function clearGeminiKey() {
    localStorage.removeItem('gemini_api_key');
    updateKeyStatus(false);
    document.getElementById('gemini-key-input').value = '';
}
function toggleKeyInput() {
    const area = document.getElementById('key-input-area');
    area.style.display = area.style.display === 'none' ? 'flex' : 'none';
}
function updateKeyStatus(hasKey) {
    const indicator = document.getElementById('key-indicator');
    const text = document.getElementById('key-text');
    if (hasKey) {
        indicator.textContent = '✅';
        text.textContent = 'Gemini API Key Set — AI Mode Active';
        text.style.color = '#4CAF50';
    } else {
        indicator.textContent = '⚙️';
        text.textContent = 'Set API Key for AI Mode (optional)';
        text.style.color = '';
    }
}
// Init key status on load
document.addEventListener('DOMContentLoaded', () => {
    const hasKey = !!localStorage.getItem('gemini_api_key');
    updateKeyStatus(hasKey);
});

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
let currentBookingData = {};
if (bookingForm) {
    bookingForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(bookingForm);
        const serviceSelect = document.getElementById('service-select');
        const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
        currentBookingData = {
            name: formData.get('name'),
            service: selectedOption.textContent.split(' — ')[0],
            price: selectedOption.getAttribute('data-price'),
            dob: formData.get('dob'), tob: formData.get('tob') + ' ' + formData.get('ampm'),
            pob: formData.get('pob'), pob_lat: formData.get('pob_lat'), pob_lon: formData.get('pob_lon'),
            question: formData.get('question'), sex: formData.get('sex')
        };
        document.getElementById('pay-service-name').innerText = currentBookingData.service;
        document.getElementById('pay-amount').innerText = currentBookingData.price;
        bookingForm.style.display = 'none';
        document.getElementById('payment-gateway').style.display = 'block';
        document.getElementById('payment-gateway').scrollIntoView({ behavior: 'smooth' });
    });
}

async function proceedToRazorpay() {
    const btn = document.getElementById('razorpay-pay-btn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing...';
    btn.disabled = true;
    try {
        const response = await fetch('/api/create_order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: currentBookingData.price, service: currentBookingData.service })
        });
        const orderData = await response.json();
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
    finally { btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay via Razorpay'; btn.disabled = false; }
}

// ==== NEWS ====
async function fetchNews() {
    try {
        const res = await fetch('/api/news');
        const data = await res.json();
        const marquee = document.getElementById('news-content-marquee');
        if (marquee) {
            const cleanHtml = data.news.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">✦ $1 ✦</a>');
            marquee.innerHTML = `<span>${cleanHtml}</span> <span>${cleanHtml}</span>`;
        }
    } catch(e) {}
}
window.onload = fetchNews;

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
