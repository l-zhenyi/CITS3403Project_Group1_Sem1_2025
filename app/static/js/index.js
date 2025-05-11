document.addEventListener("DOMContentLoaded", () => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target); 
        }
      });
    }, {
      threshold: 0.1
    });
  
    document.querySelectorAll('.slide-in').forEach(el => observer.observe(el));
  });
  
  document.addEventListener("DOMContentLoaded", () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target); 
            }
        });
    }, {
        threshold: 0.1
    });

    // Apply to all .fade-up elements
    document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));
});

document.addEventListener("DOMContentLoaded", () => {
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const cards = entry.target.querySelectorAll(".carousel-item.active .card");

                cards.forEach((card, index) => {
                    setTimeout(() => {
                        card.classList.add("visible");
                    }, index * 200); // stagger by 200ms
                });

                obs.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1
    });

    const carousel = document.querySelector(".carousel");
    if (carousel) observer.observe(carousel);
});

document.addEventListener("DOMContentLoaded", function () {
    const fadeEl = document.querySelector('.fade-up-on-scroll');
  
    if (fadeEl) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            fadeEl.classList.add('visible');
            observer.unobserve(fadeEl); // Run once
          }
        });
      }, { threshold: 0.1 });
  
      observer.observe(fadeEl);
    }
  });

  document.addEventListener("DOMContentLoaded", function () {
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");
  
    tabButtons.forEach(button => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-tab");
  
        // Toggle button styles
        tabButtons.forEach(btn => btn.classList.remove("active"));
        button.classList.add("active");
  
        // Toggle tab pane visibility
        tabPanes.forEach(pane => {
          pane.classList.remove("active");
          if (pane.id === targetId) {
            pane.classList.add("active");
          }
        });
      });
    });
  });
  