// Initialize AOS
AOS.init({
    once: true,
    offset: 50,
    duration: 800,
    easing: 'ease-in-out'
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker failed: ', err));
    });
}

// Sidebar Toggle Logic
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

// Close sidebar on anchor clicks
document.querySelectorAll('.sidebar-links a').forEach(link => {
    link.addEventListener('click', () => {
        if (sidebar.classList.contains('active')) toggleSidebar();
    });
});

// Navbar Scroll Effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Mobile Menu (Hamburger) Toggle
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        const icon = hamburger.querySelector('i');
        if (navLinks.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });
}

// FAQ Accordion
const faqQuestions = document.querySelectorAll('.faq-question');
faqQuestions.forEach(question => {
    question.addEventListener('click', () => {
        const answer = question.nextElementSibling;
        const isActive = question.classList.contains('active');

        // Close all other FAQs
        faqQuestions.forEach(q => {
            q.classList.remove('active');
            q.nextElementSibling.style.maxHeight = null;
        });

        if (!isActive) {
            question.classList.add('active');
            answer.style.maxHeight = answer.scrollHeight + "px";
        }
    });
});

// --- Formatting Helper for Date/Time Inputs ---
function setupFormatting() {
    document.querySelectorAll('.dob-format').forEach(input => {
        input.addEventListener('input', function (e) {
            let val = this.value.replace(/\D/g, '');
            if (val.length > 8) val = val.slice(0, 8);
            
            if (e.inputType !== 'deleteContentBackward') {
                if (val.length >= 4) {
                    val = val.slice(0, 2) + ' / ' + val.slice(2, 4) + ' / ' + val.slice(4);
                } else if (val.length >= 2) {
                    val = val.slice(0, 2) + ' / ' + val.slice(2);
                }
            } else {
                if (this.value.endsWith(' /')) {
                   this.value = this.value.slice(0, -2);
                   val = this.value.replace(/\D/g, '');
                }
            }
            this.value = val;

            // Auto-focus to TOB
            if (val.length === 14) { // DD / MM / YYYY
                const targetId = this.id === 'panchang-dob' ? 'panchang-tob' : 'tob-input';
                document.getElementById(targetId)?.focus();
            }
        });
    });

    document.querySelectorAll('.tob-format').forEach(input => {
        input.addEventListener('input', function (e) {
            let val = this.value.replace(/\D/g, '');
            if (val.length > 6) val = val.slice(0, 6);
            
            if (e.inputType !== 'deleteContentBackward') {
                if (val.length >= 4) {
                    val = val.slice(0, 2) + ' : ' + val.slice(2, 4) + ' : ' + val.slice(4);
                } else if (val.length >= 2) {
                    val = val.slice(0, 2) + ' : ' + val.slice(2);
                }
            } else {
                if (this.value.endsWith(' :')) {
                    this.value = this.value.slice(0, -2);
                    val = this.value.replace(/\D/g, '');
                }
            }
            this.value = val;
        });
    });
}
setupFormatting();

// --- Places Autocomplete Reusable Logic ---
function setupAutocomplete(inputId, dropdownId, latId, lonId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    const latInp = document.getElementById(latId);
    const lonInp = document.getElementById(lonId);
    let timer;

    if (!input) return;

    input.addEventListener('input', function () {
        clearTimeout(timer);
        const query = this.value.trim();
        if (query.length < 3) {
            dropdown.style.display = 'none';
            return;
        }

        timer = setTimeout(() => {
            fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`)
                .then(r => r.json())
                .then(data => {
                    dropdown.innerHTML = '';
                    if (data.length > 0) {
                        data.forEach(place => {
                            const opt = document.createElement('div');
                            opt.className = 'autocomplete-item';
                            opt.style.padding = '12px 15px';
                            opt.style.cursor = 'pointer';
                            opt.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                            opt.innerText = place.display_name;
                            opt.addEventListener('pointerdown', (e) => {
                                e.preventDefault();
                                input.value = place.display_name;
                                if(latInp) latInp.value = place.lat;
                                if(lonInp) lonInp.value = place.lon;
                                dropdown.style.display = 'none';
                            });
                            dropdown.appendChild(opt);
                        });
                        dropdown.style.display = 'block';
                    } else {
                        dropdown.style.display = 'none';
                    }
                });
        }, 500);
    });

    document.addEventListener('pointerdown', (e) => {
        if (e.target !== input && !dropdown.contains(e.target)) dropdown.style.display = 'none';
    });
}

setupAutocomplete('pob-input', 'pob-dropdown', 'pob-lat', 'pob-lon');
setupAutocomplete('panchang-pob', 'panchang-pob-dropdown', 'panchang-lat', 'panchang-lon');

// --- Booking Form Submission ---
const bookingForm = document.getElementById('booking-form');
let currentBookingData = {};

if (bookingForm) {
    bookingForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(bookingForm);
        const serviceSelect = document.getElementById('service-select');
        const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];

        currentBookingData = {
            name: formData.get('name'),
            service: selectedOption.textContent.split(' — ')[0],
            price: selectedOption.getAttribute('data-price'),
            dob: formData.get('dob'),
            tob: formData.get('tob') + ' ' + formData.get('ampm'),
            pob: formData.get('pob'),
            pob_lat: formData.get('pob_lat'),
            pob_lon: formData.get('pob_lon'),
            question: formData.get('question'),
            sex: formData.get('sex')
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
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: currentBookingData.price, service: currentBookingData.service })
        });
        const orderData = await response.json();

        const options = {
            "key": "rzp_test_SWEFJ7XQd5AYV3",
            "amount": orderData.amount,
            "currency": "INR",
            "name": "GenZ Jyotiṣa",
            "order_id": orderData.order_id,
            "handler": function (res) {
                const text = `Hari Om! I have successfully paid ₹${currentBookingData.price} for "${currentBookingData.service}".\n\n*Payment ID:* ${res.razorpay_payment_id}\n\n*Details:*\nName: ${currentBookingData.name}\nDOB: ${currentBookingData.dob}\nTOB: ${currentBookingData.tob}\nPOB: ${currentBookingData.pob}\nSex: ${currentBookingData.sex}`;
                window.location.href = `https://wa.me/919630958614?text=${encodeURIComponent(text)}`;
            }
        };
        const rzp = new Razorpay(options);
        rzp.open();
    } catch (e) {
        alert("Payment error: " + e.message);
    } finally {
        btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay via Razorpay';
        btn.disabled = false;
    }
}

// --- Panchang Calculator Logic ---
const panchangForm = document.getElementById('panchang-form');
if (panchangForm) {
    panchangForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const dob = document.getElementById('panchang-dob').value;
        const tob = document.getElementById('panchang-tob').value;
        const ampm = document.getElementById('panchang-ampm').value;
        const lat = document.getElementById('panchang-lat').value;
        const lon = document.getElementById('panchang-lon').value;
        const btn = panchangForm.querySelector('button');
        
        btn.innerHTML = '<i class="fas fa-om fa-spin"></i> Consulting Heavens...';
        btn.disabled = true;

        try {
            fetch('/api/panchang', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dob, tob, ampm, lat, lon })
            })
            .then(res => res.json())
            .then(data => {
                btn.innerHTML = 'KNOW YOUR PAÑCĀṄGA';
                btn.disabled = false;
                if (data.error) {
                    alert(`Vedic calculations failed: ${data.error}`);
                } else {
                    document.getElementById('result-vara').innerText = data.vara;
                    document.getElementById('result-tithi').innerText = data.tithi;
                    document.getElementById('result-nakshatra').innerText = data.nakshatra;
                    document.getElementById('result-yoga').innerText = data.yoga;
                    document.getElementById('result-karana').innerText = data.karana;
                    
                    // New Fields
                    if(document.getElementById('result-sunrise')) document.getElementById('result-sunrise').innerText = data.sunrise;
                    if(document.getElementById('result-sunset')) document.getElementById('result-sunset').innerText = data.sunset;
                    if(document.getElementById('result-ayanamsa')) document.getElementById('result-ayanamsa').innerText = data.ayanamsa;
                    if(document.getElementById('result-hora')) document.getElementById('result-hora').innerText = data.hora;

                    document.getElementById('panchang-results').style.display = 'block';
                    document.getElementById('panchang-results').scrollIntoView({ behavior: 'smooth' });
                }
            });
        } catch (e) {
            alert("Vedic calculations failed. Please try again.");
            btn.innerHTML = 'Retrieve Divine Panchanga';
            btn.disabled = false;
        }
    });
}

// --- Lord Krishna Chatbot Logic ---
let gitaChatHistory = [];
async function sendGitaChat(customMsg = null) {
    const input = document.getElementById('gita-chat-input');
    const msg = customMsg || input.value.trim();
    if (!msg) return;

    const window = document.getElementById('gita-chat-window');
    const typing = document.getElementById('gita-typing');
    
    // User Message
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.innerHTML = `<div class="bubble-content">${msg}</div>`;
    window.insertBefore(userBubble, typing);
    
    if (!customMsg) input.value = '';
    window.scrollTo({ top: window.scrollHeight, behavior: 'smooth' });

    // Show Typing Indicator
    typing.style.display = 'flex';
    window.scrollTo({ top: window.scrollHeight, behavior: 'smooth' });

    try {
        const res = await fetch('/api/gita/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, history: gitaChatHistory })
        });
        const data = await res.json();
        
        // Hide Typing Indicator
        typing.style.display = 'none';

        // Bot Message
        let shlokaHtml = '';
        if (data.shlokas && data.shlokas.length > 0) {
            data.shlokas.forEach(s => {
                shlokaHtml += `
                    <div class="shloka-box">
                        <div class="shloka-ref">${s.reference}</div>
                        <div class="shloka-text">${s.slok}</div>
                        <div class="shloka-trans">${s.transliteration}</div>
                    </div>`;
            });
        }

        const botBubble = document.createElement('div');
        botBubble.className = 'chat-bubble bot';
        botBubble.innerHTML = `
            <img src="assets/gita-guidance.png" class="chat-avatar" alt="Krishna">
            <div class="bubble-content">
                ${shlokaHtml}
                <strong>Lord Krishna:</strong><br>${data.response}
            </div>`;
        window.insertBefore(botBubble, typing);
        window.scrollTo({ top: window.scrollHeight, behavior: 'smooth' });
        
        gitaChatHistory.push({ role: "user", parts: [{ text: msg }] });
        gitaChatHistory.push({ role: "model", parts: [{ text: data.response }] });
    } catch (e) {
        typing.style.display = 'none';
        const errorBubble = document.createElement('div');
        errorBubble.className = 'chat-bubble bot';
        errorBubble.innerHTML = `
            <img src="assets/gita-guidance.png" class="chat-avatar" alt="Krishna">
            <div class="bubble-content" style="color:var(--accent-burgundy); font-style:italic;">
                "The divine link is momentarily broken, O seeker."
            </div>`;
        window.insertBefore(errorBubble, typing);
    }
}

function startGitaChat(query) {
    const section = document.getElementById('gita-guidance');
    section.scrollIntoView({ behavior: 'smooth' });
    sendGitaChat(query);
}

// Fetch news on load
async function fetchNews() {
    try {
        const res = await fetch('/api/news');
        const data = await res.json();
        const marquee = document.getElementById('news-content-marquee');
        if (marquee) {
            const cleanHtml = data.news.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">✦ $1 ✦</a>');
            marquee.innerHTML = `<span>${cleanHtml}</span> <span>${cleanHtml}</span>`;
        }
    } catch (e) {}
}
window.onload = fetchNews;
