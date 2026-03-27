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

// Navbar Scroll Effect
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Mobile Menu Toggle
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('nav-links');

if(hamburger) {
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        const icon = hamburger.querySelector('i');
        if(navLinks.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });
}

// Close mobile menu when a link is clicked
const mobileLinks = document.querySelectorAll('.nav-links a');
mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
        if(window.innerWidth <= 768 && navLinks.classList.contains('active')) {
            navLinks.classList.remove('active');
            hamburger.querySelector('i').classList.replace('fa-times', 'fa-bars');
        }
    });
});

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
    
    dobInput.addEventListener('input', function(e) {
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
    tobInput.addEventListener('input', function(e) {
        let val = this.value.replace(/\D/g, '');
        if (val.length > 6) val = val.slice(0, 6);
        
        let formatted = '';
        if (val.length > 0) formatted += val.slice(0, 2);
        if (val.length > 2) formatted += ' : ' + val.slice(2, 4);
        if (val.length > 4) formatted += ' : ' + val.slice(4, 6);
        
        this.value = formatted;
    });

    bookingForm.addEventListener('submit', function(e) {
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
        
        // Generate UPI QR Code URL
        const upiId = "sarthakbhattacharyyya-1@okaxis";
        const upiName = "Sarthak Bhattacharyya";
        const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${currentBookingData.price}&cu=INR`;
        
        // Use QR server to generate image for desktop
        document.getElementById('upi-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;
        
        // Mobile Deep Link Detection (If mobile, show tap-to-pay button)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            document.getElementById('mobile-pay-btn-container').style.display = 'block';
            document.getElementById('mobile-pay-btn').href = upiString;
            document.getElementById('desktop-qr-container').style.display = 'none';
        }
        
        // Populate Payment UI
        document.getElementById('pay-service-name').innerText = currentBookingData.service;
        document.getElementById('pay-amount').innerText = currentBookingData.price;
        
        // Swap Views
        bookingForm.style.display = 'none';
        paymentGateway.style.display = 'block';
    });
}

// Payment Verification & WhatsApp Redirect Logic
const verifyBtn = document.getElementById('verify-payment-btn');
if (verifyBtn) {
    verifyBtn.addEventListener('click', function() {
        const utr = document.getElementById('utr-input').value.trim();
        const screenshot = document.getElementById('payment-screenshot').files[0];
        
        if (!screenshot) {
            alert("Payment Verification Failed: Please upload a screenshot of your transaction proof.");
            return;
        }

        if (utr.length < 12) {
            alert("Payment Verification Failed: Please enter a valid 12-digit UTR or transaction reference number.");
            return;
        }
        
        // Hide gateway, show success message
        paymentGateway.style.display = 'none';
        formMessage.style.display = 'block';
        
        // Redirect to WhatsApp with payment proof
        setTimeout(() => {
            const waNumber = "919630958614";
            const focusContext = currentBookingData.question ? `\n*Focus/Questions:* ${currentBookingData.question}` : "";
            const coordsContext = (currentBookingData.pob_lat && currentBookingData.pob_lon) ? ` [Lat: ${parseFloat(currentBookingData.pob_lat).toFixed(4)}, Lon: ${parseFloat(currentBookingData.pob_lon).toFixed(4)}]` : "";
            
            const text = `Hari Om! I have completed my payment of ₹${currentBookingData.price} and am submitting my booking details.\n\n*Full Name:* ${currentBookingData.name}\n*Service:* ${currentBookingData.service}\n*Date of Birth:* ${currentBookingData.dob}\n*Time of Birth:* ${currentBookingData.tob}\n*Place of Birth:* ${currentBookingData.pob}${coordsContext}${focusContext}\n\n*Payment UTR:* ${utr}\n\n(I am attaching the payment screenshot to this message manually)`;
            
            const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
            window.open(waLink, '_blank');
        }, 1000);
        
        // Optional Backend Logging (Fails silently on static Vercel)
        const dbFormData = new FormData();
        Object.keys(currentBookingData).forEach(key => dbFormData.append(key, currentBookingData[key]));
        dbFormData.append('utr', utr);
        
        fetch('/submit_booking', { method: 'POST', body: dbFormData })
            .catch((error) => console.log("Backend not active, relying entirely on WhatsApp."));
    });
}

// Place of Birth Autocomplete API (Free OpenStreetMap Nominatim)
const pobInput = document.getElementById('pob-input');
const pobDropdown = document.getElementById('pob-dropdown');
const pobLat = document.getElementById('pob-lat');
const pobLon = document.getElementById('pob-lon');

let debounceTimer;

if (pobInput) {
    pobInput.addEventListener('input', function() {
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
    document.addEventListener('pointerdown', function(e) {
        if (pobInput && pobDropdown && e.target !== pobInput && !pobDropdown.contains(e.target)) {
            pobDropdown.style.display = 'none';
        }
    });
}
