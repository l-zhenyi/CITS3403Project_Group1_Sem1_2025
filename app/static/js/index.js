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