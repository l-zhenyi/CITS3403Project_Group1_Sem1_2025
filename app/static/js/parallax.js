// parallax.js

let isParallaxSetup = false;
let panelData = [];
let parallaxScrollHandler = null;

const collageContainer = document.getElementById('event-collage');

/**
 * Initializes parallax for all .event-panel elements in the collage container.
 */
export function setupParallax(currentView = 'groups') {
    const isMobile = window.innerWidth <= 768;
    if (!collageContainer || isParallaxSetup || isMobile || currentView !== 'groups') return;

    console.log("Setting up parallax...");

    panelData = [];
    const panels = Array.from(collageContainer.querySelectorAll('.event-panel'));
    if (!panels.length) {
        console.log("No event panels found for parallax.");
        return;
    }

    panels.forEach((panel, index) => {
        try {
            const style = window.getComputedStyle(panel);
            const matrix = new DOMMatrixReadOnly(style.transform);
            const z = matrix.is2D ? 0 : matrix.m43;

            const originalInlineTransform = panel.style.transform || '';
            const rotateMatch = originalInlineTransform.match(/rotate(?:Z|3d)?\([^)]+\)/);
const baseRotate = rotateMatch ? rotateMatch[0] : 'rotate(0deg)';

const translateZMatch = originalInlineTransform.match(/translateZ\([^)]+\)/);
const baseTranslateZ = translateZMatch ? translateZMatch[0] : 'translateZ(0px)';

            if (!['absolute', 'fixed', 'sticky'].includes(style.position)) {
                panel.style.position = 'absolute';
                panel.style.top = panel.style.top || '0px';
                panel.style.left = panel.style.left || '0px';
            }

            panelData.push({
                element: panel,
                originalInlineTransform: originalInlineTransform,
                baseRotate,
                baseTranslateZ,
                parallaxFactorY: 1 + z / 200,
                parallaxFactorX: Math.sin(z / 50),
                swayAmplitude: (Math.random() - 0.5) * 20
            });
        } catch (e) {
            console.error(`Error processing panel ${index} for parallax:`, e);
        }
    });

    let ticking = false;

    parallaxScrollHandler = () => {
        if (window.innerWidth <= 768 || currentView !== 'groups' || !panelData.length || ticking || !collageContainer) return;

        ticking = true;
        requestAnimationFrame(() => {
            const scrollTop = collageContainer.scrollTop;

            panelData.forEach(data => {
                const offsetY = -scrollTop * (1 - data.parallaxFactorY) * 0.1;
                const sway = Math.sin(scrollTop * 0.01 + data.parallaxFactorX) * data.swayAmplitude;

                data.element.style.transform = `
                    translateY(${offsetY}px)
                    translateX(${sway}px)
                    ${data.baseRotate}
                    ${data.baseTranslateZ}
                `;
            });

            ticking = false;
        });
    };

    collageContainer.addEventListener('scroll', parallaxScrollHandler);
    isParallaxSetup = true;

    // Initial transform
    parallaxScrollHandler();
    console.log(`Parallax setup complete. ${panelData.length} panels processed.`);
}

/**
 * Destroys all active parallax scroll listeners and restores original transforms.
 */
export function destroyParallax() {
    if (!collageContainer || !isParallaxSetup) return;

    console.log("Destroying parallax...");

    collageContainer.removeEventListener('scroll', parallaxScrollHandler);
    parallaxScrollHandler = null;

    panelData.forEach(data => {
        if (data?.element?.style) {
            data.element.style.transform = data.originalInlineTransform;
        }
    });

    panelData = [];
    isParallaxSetup = false;
}