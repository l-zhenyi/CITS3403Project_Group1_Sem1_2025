document.addEventListener('DOMContentLoaded', () => {
    const collageContainer = document.getElementById('event-collage');
    if (!collageContainer) return; // Exit if container not found

    const panels = Array.from(collageContainer.querySelectorAll('.event-panel'));

    // Store initial transform values and calculate parallax factors
    const panelData = panels.map(panel => {
        const style = window.getComputedStyle(panel);
        const transform = style.transform; // Gets the computed matrix
        const matrix = new DOMMatrixReadOnly(transform);

        // Extract initial Z translation (approximate) from matrix if needed,
        // otherwise use the inline style or data-attribute for simplicity.
        // For this example, let's assign factors manually or based on initial Z
        const initialZ = parseFloat(panel.style.transform.match(/translateZ\(([-0-9.]+)px\)/)?.[1] || '0');

        // Slower movement for elements further back (more negative Z)
        // Faster movement for elements closer (more positive Z)
        const parallaxFactorY = 1 + initialZ / 200; // Adjust 200 to control sensitivity
        const parallaxFactorX = Math.sin(initialZ / 50); // Example for horizontal sway

        return {
            element: panel,
            initialTransform: panel.style.transform, // Store inline style transform
            baseRotate: panel.style.transform.match(/rotate\(([-0-9.]+)deg\)/)?.[0] || '',
            baseTranslateZ: panel.style.transform.match(/translateZ\(([-0-9.]+)px\)/)?.[0] || '',
            parallaxFactorY: parallaxFactorY,
            parallaxFactorX: parallaxFactorX, // Factor for horizontal sway
            swayAmplitude: (Math.random() - 0.5) * 20 // Random sway amount per card
        };
    });

    let ticking = false; // For requestAnimationFrame optimization

    collageContainer.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const scrollTop = collageContainer.scrollTop;

                panelData.forEach(data => {
                    // Calculate vertical parallax offset
                    // We don't directly offset by scrollTop, as the container handles the main scroll.
                    // Instead, we add a *subtle* additional offset based on scroll progress.
                    // Let's try adjusting the Z or Y slightly based on scroll for a subtle depth shift.
                    const scrollFactor = scrollTop * 0.1; // Adjust sensitivity

                    // Example: Subtle vertical shift based on parallax factor
                    const offsetY = -scrollTop * (1 - data.parallaxFactorY) * 0.1; // Subtle parallax Y

                    // Example: Horizontal sway ("carousel") based on scroll and factor
                    const sway = Math.sin(scrollTop * 0.01 + data.parallaxFactorX) * data.swayAmplitude; // Adjust 0.01 for speed
                    const offsetX = sway;

                    // Combine base transform with scroll-based adjustments
                    // NOTE: Order of transforms matters! Translate first, then rotate/scale usually works best.
                    // This is simplified; robustly combining transforms requires matrix math or careful string parsing.
                    // We'll re-apply the base rotation/Z and add the dynamic translations.

                    // Reconstruct transform (Simplified - assumes specific initial format)
                    data.element.style.transform = `
                        translateY(${offsetY}px)
                        translateX(${offsetX}px)
                        ${data.baseRotate}
                        ${data.baseTranslateZ}
                    `;

                });
                ticking = false;
            });
            ticking = true;
        }
    });
});