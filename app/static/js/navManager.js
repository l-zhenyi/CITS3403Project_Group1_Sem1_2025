// --- START OF FILE static/js/navManager.js ---

let navElement = null;
let navToggleBtn = null;
let navLeftLinksContainer = null;
let isNavManagerInitialized = false;

function toggleMobileMenu() {
    if (!navElement || !navLeftLinksContainer || !navToggleBtn) return;

    const isExpanded = navLeftLinksContainer.classList.toggle('menu-open');
    navToggleBtn.setAttribute('aria-expanded', isExpanded.toString());
    navToggleBtn.classList.toggle('active', isExpanded); // For hamburger to X icon transition

    // Optional: Add/remove a class on the main nav to indicate menu is open
    // This can be useful if the expanded menu affects other elements or requires body overflow changes.
    navElement.classList.toggle('mobile-menu-active', isExpanded);

    if (isExpanded) {
        // Optional: Add listener to close menu if clicked outside
        // document.addEventListener('click', handleClickOutsideMobileMenu, true);
    } else {
        // document.removeEventListener('click', handleClickOutsideMobileMenu, true);
    }
}

// Optional: Click outside to close
/*
function handleClickOutsideMobileMenu(event) {
    if (navElement && navLeftLinksContainer.classList.contains('menu-open')) {
        if (!navElement.contains(event.target)) {
            toggleMobileMenu(); // Close the menu
        }
    }
}
*/

export function setupMobileNav() {
    if (isNavManagerInitialized) return;

    navElement = document.querySelector('.top-nav');
    navToggleBtn = document.getElementById('hamburger-menu-toggle'); // Expecting this ID in HTML
    navLeftLinksContainer = document.querySelector('.top-nav-left');

    if (!navElement || !navToggleBtn || !navLeftLinksContainer) {
        console.warn("Mobile navigation elements not found (nav, toggle button, or left links). Hamburger menu will not function.");
        return;
    }

    navToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent click from immediately closing if using click-outside
        toggleMobileMenu();
    });
    
    // Close menu if a link inside it is clicked (typical behavior)
    navLeftLinksContainer.addEventListener('click', (e) => {
        if (e.target.tagName === 'A' && navLeftLinksContainer.classList.contains('menu-open')) {
            toggleMobileMenu();
        }
    });

    // Reset menu on resize to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && navLeftLinksContainer.classList.contains('menu-open')) {
            toggleMobileMenu(); // Close it
        }
    });

    isNavManagerInitialized = true;
    console.log("Mobile navigation manager initialized.");
}

// --- END OF FILE static/js/navManager.js ---