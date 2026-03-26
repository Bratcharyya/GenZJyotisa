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
    bookingForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(bookingForm);
        const serviceSelect = document.getElementById('service-select');
        const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
        
        currentBookingData = {
            name: formData.get('name'),
            service: selectedOption.textContent.split(' - ')[0], // Extracts clean service name
            price: selectedOption.getAttribute('data-price'),
            dob: formData.get('dob'),
            tob: formData.get('tob'),
            question: formData.get('question')
        };
        
        if (!currentBookingData.price || currentBookingData.price === "0") {
            alert("Please select a valid service.");
            return;
        }
        
        // Generate UPI QR Code URL
        const upiId = "sarthakbhattacharyyya-1@okaxis";
        const upiName = "Sarthak Bhattacharyya";
        const upiString = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${currentBookingData.price}&cu=INR`;
        
        // Use QR server to generate image
        document.getElementById('upi-qr').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiString)}`;
        
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
        
        if (utr.length < 12) {
            alert("Payment Verification Failed: Please enter a valid 12-digit UTR or transaction reference number from your payment app (Google Pay/PhonePe/Paytm).");
            return;
        }
        
        // Hide gateway, show success message
        paymentGateway.style.display = 'none';
        formMessage.style.display = 'block';
        
        // Redirect to WhatsApp with payment proof
        setTimeout(() => {
            const waNumber = "919630958614";
            const focusContext = currentBookingData.question ? `\nFocus/Question: ${currentBookingData.question}` : "";
            
            const text = `Hari Om! I have completed my payment of ₹${currentBookingData.price} and am submitting my booking details.\n\n*Name:* ${currentBookingData.name}\n*Service:* ${currentBookingData.service}\n*DOB:* ${currentBookingData.dob}\n*TOB:* ${currentBookingData.tob}${focusContext}\n\n*Payment UTR:* ${utr}`;
            
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
