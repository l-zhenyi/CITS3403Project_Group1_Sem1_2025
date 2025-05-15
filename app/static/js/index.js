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
        
        // Toggle button styles
        tabButtons.forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");

        // Toggle tab pane visibility with transition
        tabPanes.forEach(pane => {
          if (pane.id === targetId) {
            // First hide all panes
            tabPanes.forEach(p => {
              p.classList.remove("active");
              p.style.opacity = "0";
            });
            
            // Then show the selected pane
            setTimeout(() => {
              pane.classList.add("active");
              setTimeout(() => {
                pane.style.opacity = "1";
              }, 50);
            }, 50);
            
            // Reset animations within the tab
            const animatedElements = pane.querySelectorAll('.fade-left, .scale-in');
            animatedElements.forEach(el => {
              el.classList.remove('visible');
              setTimeout(() => {
                el.classList.add('visible');
              }, 100);
            });
          }
        });
      });
    });
  };
  
  setupTabs();

  // Make hero section immediately visible
  document.querySelectorAll('.hero-section, .hero-text, .hero-illustration')
    .forEach(el => el.classList.add('visible'));
    
  // Fixed and simplified testimonial carousel
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
    
    // Calculate how many slides to show per group (desktop: 3, mobile: 1)
    const getGroupSize = () => window.innerWidth < 768 ? 1 : 3;
    
    // Define how slides shift - full width of visible group
    const getShiftAmount = () => -100 * currentIndex;
    
    let currentIndex = 0;
    const totalGroups = Math.ceil(slides.length / getGroupSize());
    
    // Function to update track position based on currentIndex
    const updateCarousel = () => {
      // Set transform based on current position
      track.style.transform = `translateX(${getShiftAmount()}%)`;
      
      // Update active dot
      dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentIndex);
      });
    };
    
    // Navigation functions
    const goToSlide = (index) => {
      // Ensure index is within bounds
      if (index < 0) index = 0;
      if (index >= totalGroups) index = totalGroups - 1;
      
      currentIndex = index;
      updateCarousel();
    };
    
    const goToNext = () => goToSlide(currentIndex + 1);
    const goToPrev = () => goToSlide(currentIndex - 1);
    
    // Add event listeners
    if (prevButton) prevButton.addEventListener('click', (e) => {
      e.preventDefault();
      goToPrev();
      resetAutoAdvance();
    });
    
    if (nextButton) nextButton.addEventListener('click', (e) => {
      e.preventDefault();
      goToNext();
      resetAutoAdvance();
    });
    
    // Add dot navigation
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        goToSlide(i);
        resetAutoAdvance();
      });
    });
    
    // Auto-advance carousel
    let autoAdvanceTimer;
    
    const startAutoAdvance = () => {
      autoAdvanceTimer = setInterval(() => {
        let nextIndex = currentIndex + 1;
        if (nextIndex >= totalGroups) nextIndex = 0;
        goToSlide(nextIndex);
      }, 8000); // Changed from 5000 to 8000 - wait 8 seconds between slides
    };
    
    const resetAutoAdvance = () => {
      clearInterval(autoAdvanceTimer);
      startAutoAdvance();
    };
    
    // Handle window resize
    const handleResize = () => {
      // Re-calculate sizes based on current viewport
      const groupSize = getGroupSize();
      
      // Ensure current index is still valid with new group size
      if (currentIndex >= Math.ceil(slides.length / groupSize)) {
        currentIndex = Math.max(0, Math.ceil(slides.length / groupSize) - 1);
      }
      
      // Update carousel
      updateCarousel();
    };
    
    // Initialize carousel
    updateCarousel();
    startAutoAdvance();
    
    // Setup resize handler
    window.addEventListener('resize', handleResize);
    
    // Add keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        goToPrev();
        resetAutoAdvance();
      } else if (e.key === 'ArrowRight') {
        goToNext();
        resetAutoAdvance();
      }
    });
    
    // Add touch/swipe support
    let touchStartX = 0;
    let touchEndX = 0;
    
    carousel.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    
    carousel.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].clientX;
      
      // Calculate swipe distance and direction
      const swipeDistance = touchEndX - touchStartX;
      
      if (swipeDistance < -50) { // Swiped left
        goToNext();
        resetAutoAdvance();
      } else if (swipeDistance > 50) { // Swiped right
        goToPrev();
        resetAutoAdvance();
      }
    }, { passive: true });
    
    // Pause auto-advance on hover
    carousel.addEventListener('mouseenter', () => clearInterval(autoAdvanceTimer));
    carousel.addEventListener('mouseleave', startAutoAdvance);
  };
  
  // Run the carousel setup
  setupTestimonialCarousel();
});
