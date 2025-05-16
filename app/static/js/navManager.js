// --- START OF FILE static/js/navManager.js ---

let navElement = null; // The main .top-nav bar
let navToggleBtn = null; // The hamburger button
let mobileNavPanel = null; // The new mobile panel: #mobile-navigation-panel
let isNavManagerInitialized = false;

function toggleMobileMenu() {
    if (!mobileNavPanel || !navToggleBtn) return;

    const isExpanded = mobileNavPanel.classList.toggle('menu-open');
    navToggleBtn.setAttribute('aria-expanded', isExpanded.toString());
    navToggleBtn.classList.toggle('active', isExpanded); // For hamburger to X icon transition

    // Optional: If you want a body class to prevent scrolling when menu is open
    document.body.classList.toggle('mobile-menu-is-active', isExpanded);

    // Optional: Add listener to close menu if clicked outside
    // For a fixed panel, clicking outside means clicking on the main content area.
    // A full-screen overlay might be better for "click outside" if desired.
    /*
    if (isExpanded) {
        document.addEventListener('click', handleClickOutsideMobileMenu, true);
    } else {
        document.removeEventListener('click', handleClickOutsideMobileMenu, true);
    }
    */
}

/*
// Optional: Click outside to close (needs careful implementation with fixed panel)
function handleClickOutsideMobileMenu(event) {
    if (mobileNavPanel && mobileNavPanel.classList.contains('menu-open')) {
        // If click is not on the panel itself AND not on the toggle button
        if (!mobileNavPanel.contains(event.target) && !navToggleBtn.contains(event.target)) {
            toggleMobileMenu(); // Close the menu
        }
    }
}
*/

export function setupMobileNav() {
    if (isNavManagerInitialized) return;

    navElement = document.querySelector('.top-nav'); // Still useful for context, like getting its height
    navToggleBtn = document.getElementById('hamburger-menu-toggle');
    mobileNavPanel = document.getElementById('mobile-navigation-panel'); // Target the new panel

    if (!navToggleBtn || !mobileNavPanel) {
        console.warn("Mobile navigation elements not found (toggle button or mobile panel). Hamburger menu will not function.");
        return;
    }
    // Set --top-nav-height CSS variable dynamically
    if (navElement) {
        const topNavHeight = navElement.offsetHeight;
        document.documentElement.style.setProperty('--top-nav-height', `${topNavHeight}px`);
    }


    navToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); 
        toggleMobileMenu();
    });
    
    // Close menu if a link inside it is clicked
    mobileNavPanel.addEventListener('click', (e) => {
        if (e.target.tagName === 'A' && mobileNavPanel.classList.contains('menu-open')) {
            toggleMobileMenu();
        }
    });

    // Reset menu on resize to desktop
    window.addEventListener('resize', () => {
        // Recalculate nav height on resize for padding
        if (navElement) {
            const topNavHeight = navElement.offsetHeight;
            document.documentElement.style.setProperty('--top-nav-height', `${topNavHeight}px`);
        }

        if (window.innerWidth > 768 && mobileNavPanel.classList.contains('menu-open')) {
            toggleMobileMenu(); // Close it
        }
    });

    isNavManagerInitialized = true;
    console.log("Mobile navigation manager initialized (with off-canvas panel).");
}

// --- END OF FILE static/js/navManager.js ---