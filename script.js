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

// Booking Form Handler
const bookingForm = document.getElementById('booking-form');
const formMessage = document.getElementById('form-message');

if (bookingForm) {
    bookingForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // Collect form data for WhatsApp redirect
        const formData = new FormData(this);
        const name = formData.get('name');
        const service = formData.get('service');
        const dob = formData.get('dob');
        const tob = formData.get('tob');
        
        // Show success message immediately
        formMessage.style.display = 'block';
        
        // WhatsApp Redirect unconditionally (Works perfectly on Vercel without backend)
        setTimeout(() => {
            const waNumber = "919630958614";
            const text = `Hari Om! I just submitted a booking request on GenZ Jyotiṣa.\n\nName: ${name}\nService: ${service}\nDOB: ${dob}\nTOB: ${tob}\n\nPlease share the payment details.`;
            const waLink = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
            window.open(waLink, '_blank');
        }, 1500);

        // Optional Backend Logging (Fails silently on static Vercel)
        fetch('/submit_booking', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => console.log("Backend log success:", data))
        .catch((error) => console.log("Backend not active, relying entirely on WhatsApp."));
        
        bookingForm.reset();
    });
}

