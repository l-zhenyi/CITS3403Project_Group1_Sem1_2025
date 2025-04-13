// Select the outer container for mouse events and border control
const glassContainer = document.querySelector('.glass-container');
// Select the inner card for blur control and sheen coordinates
const glassCard = document.querySelector('.glass-card');
const fogginessSlider = document.getElementById('fogginess');
const fogginessValueDisplay = document.getElementById('fogginess-value');

// Function to update mouse position variables
document.addEventListener('mousemove', (e) => {
    const rect = glassContainer.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = e.clientX - centerX;
    const dy = e.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const maxDistance = 600;
    const proximity = Math.max(0, 1 - distance / maxDistance);
    const clampedProximity = Math.min(1, proximity);

    // Update variables on the container
    glassContainer.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
    glassContainer.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    glassContainer.style.transform = 'translateZ(0)';

    // Update variables on the inner card
    const cardRect = glassCard.getBoundingClientRect();
    glassCard.style.setProperty('--mouse-x', `${e.clientX - cardRect.left}px`);
    glassCard.style.setProperty('--mouse-y', `${e.clientY - cardRect.top}px`);
    glassCard.style.transform = 'translateZ(0) rotateX(0deg)';

    // Update glow/sheeen based on proximity
    glassContainer.style.setProperty('--glow-opacity', clampedProximity);
    glassContainer.style.setProperty('--sheen-opacity', clampedProximity * 0.8);
});

// Function to update blur based on slider
function updateFogginess() {
    const blurValue = fogginessSlider.value;
    // Update the blur variable on the inner card
    glassCard.style.setProperty('--blur-amount', `${blurValue}px`);
    fogginessValueDisplay.textContent = `${blurValue}px`;
}

// Attach input event listener to slider
fogginessSlider.addEventListener('input', updateFogginess);

// Initial update on load
updateFogginess();