document.addEventListener("DOMContentLoaded", () => {
  // Create a single IntersectionObserver for all animation effects
  const animationObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        // Only unobserve if it's not a repeated animation
        if (!entry.target.dataset.repeat) {
          animationObserver.unobserve(entry.target);
        }
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"  // Trigger slightly before elements come into view
  });
  
  // Target all elements with animation classes
  const animatedElements = document.querySelectorAll(
    '.slide-in, .fade-up, .fade-up-on-scroll, .fade-left, .scale-in, .animated-card, .delay-200'
  );
  
  // Observe all animated elements 
  animatedElements.forEach(el => {
    animationObserver.observe(el);
    // Set a timeout to ensure elements become visible even if observer fails
    setTimeout(() => {
      if (!el.classList.contains('visible')) {
        el.classList.add('visible');
      }
    }, 1000); // Fallback after 1 second
  });

  // Fixed tab switching functionality
  const setupTabs = () => {
    const tabButtons = document.querySelectorAll(".btn-tab");
    const tabPanes = document.querySelectorAll(".tab-pane");
    
    if (tabButtons.length === 0 || tabPanes.length === 0) return;

    tabButtons.forEach(button => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-tab");
        
        // Toggle button styles - explicitly adding/removing classes
        tabButtons.forEach(btn => {
          btn.classList.remove("active");
          btn.setAttribute("aria-selected", "false");
        });
        
        button.classList.add("active");
        button.setAttribute("aria-selected", "true");

        // Toggle tab pane visibility
        tabPanes.forEach(pane => {
          pane.classList.remove("active");
          pane.style.opacity = "0";
          
          if (pane.id === targetId) {
            setTimeout(() => {
              pane.classList.add("active");
              setTimeout(() => {
                pane.style.opacity = "1";
              }, 10);
            }, 50);
          }
        });
      });
    });
  };
  
  setupTabs();

  // Make hero section immediately visible
  document.querySelectorAll('.hero-section, .hero-text, .hero-illustration')
    .forEach(el => el.classList.add('visible'));
    
  // Fixed testimonial carousel implementation
  const setupTestimonialCarousel = () => {
    const carousel = document.getElementById('testimonialCarousel');
    if (!carousel) return;
    
    const track = carousel.querySelector('.testimonial-track');
    if (!track) return;
    
    const slides = carousel.querySelectorAll('.testimonial-slide');
    if (slides.length === 0) return;
    
    const prevButton = carousel.querySelector('#prevTestimonial');
    const nextButton = carousel.querySelector('#nextTestimonial');
    const dots = carousel.querySelectorAll('.carousel-dot');
    
    // Fixed calculation of slides per view and total groups
    const slidesPerView = window.innerWidth < 768 ? 1 : 3;
    const totalGroups = Math.ceil(slides.length / slidesPerView);
    let currentIndex = 0;
    
    // Update carousel positions
    const updateCarousel = () => {
      // Calculate percentage to shift based on current index and slidesPerView
      const percentageToShift = (currentIndex * 100) / slidesPerView;
      track.style.transform = `translateX(-${percentageToShift}%)`;
      
      // Update active dot
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
      });
    };
    
    // Navigate to specific slide group
    const goToSlide = (index) => {
      // Bounds checking
      if (index < 0) index = 0;
      if (index >= totalGroups) index = 0; // Loop back to start
      
      currentIndex = index;
      updateCarousel();
    };
    
    // Set up button listeners
    if (prevButton) {
      prevButton.addEventListener('click', (e) => {
        e.preventDefault();
        goToSlide(currentIndex - 1);
        resetAutoAdvance();
      });
    }
    
    if (nextButton) {
      nextButton.addEventListener('click', (e) => {
        e.preventDefault();
        goToSlide(currentIndex + 1);
        resetAutoAdvance();
      });
    }
    
    // Set up dot listeners
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        goToSlide(i);
        resetAutoAdvance();
      });
    });
    
    // Auto-advance functionality
    let autoAdvanceTimer;
    
    const startAutoAdvance = () => {
      autoAdvanceTimer = setInterval(() => {
        goToSlide(currentIndex + 1);
      }, 8000);
    };
    
    const resetAutoAdvance = () => {
      clearInterval(autoAdvanceTimer);
      startAutoAdvance();
    };
    
    // Initialize the carousel
    updateCarousel();
    startAutoAdvance();
    
    // Add touch swipe support
    let touchStartX = 0;
    
    carousel.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      clearInterval(autoAdvanceTimer);
    }, { passive: true });
    
    carousel.addEventListener('touchend', (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX - touchEndX;
      
      if (diff > 50) { // Swipe left
        goToSlide(currentIndex + 1);
      } else if (diff < -50) { // Swipe right
        goToSlide(currentIndex - 1);
      }
      
      startAutoAdvance();
    }, { passive: true });
    
    // Pause on hover
    carousel.addEventListener('mouseenter', () => {
      clearInterval(autoAdvanceTimer);
    });
    
    carousel.addEventListener('mouseleave', () => {
      startAutoAdvance();
    });
  };
  
  // Run the carousel setup
  setupTestimonialCarousel();
});
