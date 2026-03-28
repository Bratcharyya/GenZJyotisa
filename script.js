// Initialize AOS
AOS.init({
    once: true,
    offset: 50,
    duration: 800,
    easing: 'ease-in-out'
});

// Register Service Worker for PWA (Installable App)
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
const sidebarAnchors = document.querySelectorAll('.sidebar-link-item'); // Added class in HTML update logic if needed, but I'll use sidebar-links a

function toggleSidebar() {
    sidebar.classList.toggle('active');
    sidebarOverlay.classList.toggle('active');
    document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
}

if (sidebarToggle) sidebarToggle.addEventListener('click', toggleSidebar);
if (sidebarClose) sidebarClose.addEventListener('click', toggleSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

// Close sidebar on anchor clicks & handle special tab switching
document.querySelectorAll('.sidebar-links a').forEach(link => {
    link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');

        // Special handling for Krishna Chat sidebar link
        if (href === '#gita-guidance') {
            switchGitaTab('chat');
        }

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

// Booking// Booking Form Submission & Payment Gateway Logic
const bookingForm = document.getElementById('booking-form');
const paymentGateway = document.getElementById('payment-gateway');
const formMessage = document.getElementById('form-message');
let currentBookingData = {};

if (bookingForm) {
    // DOB Auto-formatting (DD/MM/YYYY)
    const dobInput = document.getElementById('dob-input');
    const tobInput = document.getElementById('tob-input');

    dobInput.addEventListener('input', function (e) {
        let val = this.value.replace(/\D/g, '');
        if (val.length > 8) val = val.slice(0, 8);

        let formatted = '';
        if (val.length > 0) formatted += val.slice(0, 2);
        if (val.length > 2) formatted += ' / ' + val.slice(2, 4);
        if (val.length > 4) formatted += ' / ' + val.slice(4, 8);

        this.value = formatted;

        // Auto-focus to Time of Birth once DOB is complete
        if (val.length === 8) {
            setTimeout(() => tobInput.focus(), 100);
        }
    });

    // TOB Auto-formatting (HH:MM:SS)
    tobInput.addEventListener('input', function (e) {
        let val = this.value.replace(/\D/g, '');
        if (val.length > 6) val = val.slice(0, 6);

        let formatted = '';
        if (val.length > 0) formatted += val.slice(0, 2);
        if (val.length > 2) formatted += ' : ' + val.slice(2, 4);
        if (val.length > 4) formatted += ' : ' + val.slice(4, 6);

        this.value = formatted;
    });

    bookingForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const formData = new FormData(bookingForm);
        const serviceSelect = document.getElementById('service-select');
        const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];

        currentBookingData = {
            name: formData.get('name'),
            service: selectedOption.textContent.split(' - ')[0],
            price: selectedOption.getAttribute('data-price'),
            dob: formData.get('dob'),
            tob: formData.get('tob') + ' ' + formData.get('ampm'),
            pob: formData.get('pob'),
            pob_lat: formData.get('pob_lat'),
            pob_lon: formData.get('pob_lon'),
            question: formData.get('question')
        };

        if (!currentBookingData.price || currentBookingData.price === "0") {
            alert("Please select a valid service.");
            return;
        }

        // Strict Validation for Time of Birth (Since we use a select for AM/PM now, only check format)
        if (currentBookingData.dob.length < 14 || currentBookingData.tob.length < 11) {
            alert("Please provide complete Birth Date and Time.");
            return;
        }

        // Populate Payment UI
        document.getElementById('pay-service-name').innerText = currentBookingData.service;
        document.getElementById('pay-amount').innerText = currentBookingData.price;

        // Swap Views
        bookingForm.style.display = 'none';
        paymentGateway.style.display = 'block';
    });
}

// Proceed to Razorpay Payment Function
async function proceedToRazorpay() {
    const btn = document.getElementById('razorpay-pay-btn');
    if (!btn) return;

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initializing Checkout...';
    btn.disabled = true;

    try {
        // 1. Fetch Order ID from Backend
        const response = await fetch('/api/create_order', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: currentBookingData.price,
                service: currentBookingData.service
            })
        });
        
        const orderData = await response.json();
        
        if (orderData.status !== 'success') {
            throw new Error(orderData.message || "Failed to create order");
        }

        // 2. Razorpay Integration Options
        const options = {
            "key": "rzp_test_SWEFJ7XQd5AYV3", // Backend creates the order, Frontend still needs the key to load the UI
            "amount": orderData.amount, // Amount in paise from backend
            "currency": orderData.currency,
            "name": "GenZ Jyotiṣa",
            "description": currentBookingData.service,
            "image": "assets/zodiac.png",
            "order_id": orderData.order_id, // Pass the newly generated order ID
            "handler": function (response) {
                // SUCCESS: Redirect to WhatsApp with Payment ID
                const waNumber = "919630958614";
                const text = `Hari Om! I have successfully paid ₹${currentBookingData.price} for "${currentBookingData.service}".\n\n*Payment ID:* ${response.razorpay_payment_id}\n*Order ID:* ${response.razorpay_order_id}\n\n*Booking Details:*\nName: ${currentBookingData.name}\nDOB: ${currentBookingData.dob}\nTOB: ${currentBookingData.tob}\nPOB: ${currentBookingData.pob}`;
                window.location.href = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
            },
            "prefill": {
                "name": currentBookingData.name,
                "email": currentBookingData.email,
                "contact": currentBookingData.whatsapp
            },
            "theme": {
                "color": "#C9A84C"
            },
            "modal": {
                "ondismiss": function () {
                    btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay via Razorpay';
                    btn.disabled = false;
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            alert("Payment failed! Please try again. (" + response.error.description + ")");
            btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay via Razorpay';
            btn.disabled = false;
        });
        rzp.open();
    } catch (e) {
        console.error("Razorpay Error:", e);
        alert("Razorpay implementation is currently experiencing issues. Please try again. " + e.message);
        btn.innerHTML = '<i class="fas fa-credit-card"></i> Pay via Razorpay';
        btn.disabled = false;
    }
}

// Place of Birth Autocomplete API (Free OpenStreetMap Nominatim)
const pobInput = document.getElementById('pob-input');
const pobDropdown = document.getElementById('pob-dropdown');
const pobLat = document.getElementById('pob-lat');
const pobLon = document.getElementById('pob-lon');

let debounceTimer;

if (pobInput) {
    pobInput.addEventListener('input', function () {
        clearTimeout(debounceTimer);
        const query = this.value.trim();

        if (query.length < 3) {
            pobDropdown.style.display = 'none';
            return;
        }

        debounceTimer = setTimeout(() => {
            fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`, {
                headers: { 'Accept-Language': 'en-US,en;q=0.9' }
            })
                .then(response => response.json())
                .then(data => {
                    pobDropdown.innerHTML = '';
                    if (data.length > 0) {
                        data.forEach(place => {
                            const option = document.createElement('div');
                            option.style.padding = '15px'; // Thicker padding for massive thumbs on mobile
                            option.style.cursor = 'pointer';
                            option.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                            option.style.fontSize = '16px';
                            option.style.color = 'var(--text-primary)';
                            option.style.lineHeight = '1.4';

                            option.addEventListener('mouseover', () => option.style.background = 'rgba(201,168,76,0.1)');
                            option.addEventListener('mouseout', () => option.style.background = 'transparent');

                            option.innerText = place.display_name;

                            // Pointerdown acts instantly on mobile (before blur logic destroys the menu)
                            option.addEventListener('pointerdown', (e) => {
                                e.preventDefault(); // Prevents keyboard from immediately closing if active
                                pobInput.value = place.display_name;
                                pobLat.value = place.lat;
                                pobLon.value = place.lon;
                                pobDropdown.style.display = 'none';
                            });

                            pobDropdown.appendChild(option);
                        });
                        pobDropdown.style.display = 'block';
                    } else {
                        pobDropdown.style.display = 'none';
                    }
                })
                .catch(err => {
                    console.error('Error fetching places:', err);
                    pobDropdown.style.display = 'none';
                });
        }, 500);
    });

    // Close dropdown instantly when clicking/tapping elsewhere
    document.addEventListener('pointerdown', function (e) {
        if (pobInput && pobDropdown && e.target !== pobInput && !pobDropdown.contains(e.target)) {
            pobDropdown.style.display = 'none';
        }
    });
}

// --- Bhagavad Gita Integrated Logic ---

function switchGitaTab(tab) {
    document.querySelectorAll('.gita-tab-btn').forEach(b => {
        b.classList.remove('active');
        b.style.color = '#b0a4d4';
        b.style.borderBottom = 'none';
    });
    const activeBtn = document.querySelector(`button[onclick="switchGitaTab('${tab}')"]`);
    activeBtn.classList.add('active');
    activeBtn.style.color = 'var(--accent-gold)';
    activeBtn.style.borderBottom = '2px solid var(--accent-gold)';

    document.getElementById('gita-verses-ui').style.display = tab === 'verses' ? 'block' : 'none';
    document.getElementById('gita-chat-ui').style.display = tab === 'chat' ? 'block' : 'none';
}

async function getGitaGuidance() {
    const input = document.getElementById('feeling-input');
    const query = input.value.trim();
    if (!query) return;

    const resultsDiv = document.getElementById('gita-guidance-results');
    resultsDiv.innerHTML = '<p style="text-align:center; padding:1rem; opacity:0.8;">Seeking divine wisdom... 🙏</p>';

    try {
        const res = await fetch('/api/gita/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const data = await res.json();

        let html = `<div style="background:rgba(255,255,255,0.05); padding:1rem; border-radius:8px; margin-bottom:1rem; border-left:3px solid var(--accent-gold); font-style:italic;">"${data.insight}"</div>`;
        data.verses.forEach(v => {
            html += `
                <div style="margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid rgba(255,213,79,0.1);">
                    <strong style="color:var(--accent-gold); display:block; margin-bottom:0.5rem;">${v.reference}</strong>
                    <p style="font-size:0.95rem; line-height:1.5;">${v.text}</p>
                </div>
            `;
        });
        resultsDiv.innerHTML = html;
        input.value = '';
    } catch (e) {
        console.error("Gita Guidance Error:", e);
        resultsDiv.innerHTML = `
            <div style="background:rgba(107,31,42,0.1); padding:1rem; border-radius:8px; border-left:3px solid var(--accent-burgundy);">
                <p>O seeker, the cosmic connection is momentarily obscured. (Check your internet or try again later.)</p>
            </div>`;
    }
}

let gitaChatHistory = [];
let globalNewsText = ""; // Cache for context injection

async function sendGitaChat() {
    const input = document.getElementById('gita-chat-input');
    const userMessage = input.value.trim();
    if (!userMessage) return;

    const window = document.getElementById('gita-chat-window');
    window.innerHTML += `<div style="text-align:right; margin-bottom:1rem; color:#fff;"><strong>You:</strong> ${userMessage}</div>`;
    input.value = '';
    window.scrollTop = window.scrollHeight;

    // Context Injection Strategy (Bypasses Free Tier SDK Limits)
    let payloadMessage = userMessage;
    if (gitaChatHistory.length === 0 && globalNewsText) {
        payloadMessage = `[System Internet-Context Injection:\nLatest World Breaking News: ${globalNewsText}\n\nYou are Lord Krishna from the Bhagavad Gita. If the user asks about current events, use the above news graciously in your response. Otherwise, ignore it and answer them normally.]\n\nUser Question: ${userMessage}`;
    }

    try {
        const res = await fetch('/api/gita/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: payloadMessage, history: gitaChatHistory })
        });
        const data = await res.json();

        window.innerHTML += `<div style="margin-bottom:1rem; color:var(--accent-gold);"><strong>Lord Krishna:</strong> ${data.response}</div>`;
        window.scrollTop = window.scrollHeight;

        gitaChatHistory.push({ role: "user", parts: [{ text: payloadMessage }] });
        gitaChatHistory.push({ role: "model", parts: [{ text: data.response }] });
    } catch (e) {
        console.error("Krishna Chat Error:", e);
        window.innerHTML += `<div style="color:var(--accent-burgundy); margin-top:0.5rem; font-style:italic;">"O Arjuna, the divine link is weak. Stay patient and seek again."</div>`;
        window.scrollTop = window.scrollHeight;
    }
}

// --- Dynamic Breaking News Logic ---

async function fetchBreakingNews() {
    const marquee = document.getElementById('news-content-marquee');
    if (!marquee) return;

    try {
        const response = await fetch('/api/news');
        if (!response.ok) throw new Error('News API failure');
        const data = await response.json();
        
        globalNewsText = data.news; // Cache locally for the chatbot

        // Convert [Headline](URL) to <a> tags - handle slightly varied markdown
        const html = data.news.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">✦ $1 ✦</a>');

        // Clean up separators like | or • if they exist
        const cleanHtml = html.replace(/\|/g, ' • ');

        // Duplicate content for seamless scrolling
        marquee.innerHTML = `<span>${cleanHtml}</span> <span>${cleanHtml}</span>`;
    } catch (error) {
        console.error("Breaking News Error:", error);
        marquee.innerHTML = '<span>✦ Celestial updates unfolding... ✦ Spiritual wisdom is eternal... ✦ Stay tuned for more ✦</span>';
    }
}

// Ensure news is fetched after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchBreakingNews);
} else {
    fetchBreakingNews();
}

// Auto-refresh news every 60 minutes for up-to-date headlines
setInterval(fetchBreakingNews, 3600000);
