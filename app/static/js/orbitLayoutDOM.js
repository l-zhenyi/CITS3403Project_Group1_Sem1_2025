// orbitLayoutDOM.js

/**
 * Lays out DOM elements (e.g. .event-panel) in concentric orbits around a node.
 * Dynamically arranges events in full rings (except the first), spaced evenly.
 * @param {HTMLElement} nodeEl The central node element.
 * @param {HTMLElement[]} eventEls Array of event panel elements to arrange.
 * @param {boolean} [useTransition=true] Whether to apply CSS transitions.
 */
export function layoutEventsAroundNodeDOM(nodeEl, eventEls, useTransition = true) {
  if (!nodeEl || !eventEls || eventEls.length === 0) return; // Add checks

  // Use getBoundingClientRect relative to the viewport, then adjust for container offset and scale
  // This is more robust than relying purely on style.left/top if transformations are complex
  const container = nodeEl.offsetParent; // Usually the event-panels-container
  if (!container) return; // Need the container for reference

  const nodeRect = nodeEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const scaleMatch = container.style.transform.match(/scale\(([\d.]+)\)/);
  const currentScale = scaleMatch ? parseFloat(scaleMatch[1]) : 1;

  // Calculate node center in the *container's* coordinate space
  const nodeCenterX = (nodeRect.left + nodeRect.width / 2 - containerRect.left) / currentScale;
  const nodeCenterY = (nodeRect.top + nodeRect.height / 2 - containerRect.top) / currentScale;

  // --- Adjusted constants for typical event panels ---
  const nodeRadius = nodeEl.offsetWidth / 2; // Base on actual size
  const baseRadius = nodeRadius + 60; // Distance for first ring (adjust as needed)
  const ringStep = 90; // Distance between rings (adjust as needed)
  const spacingTarget = 160; // Min pixel arc per item (panel width + spacing)
  // --- End Adjusted Constants ---

  const events = [...eventEls]; // Clone array to mutate

  let currentRing = 0;
  let placed = 0;

  while (events.length > 0) {
    const radius = baseRadius + currentRing * ringStep;
    // Estimate slots based on target spacing - minimum 1 slot
    let slots = Math.max(1, Math.floor((2 * Math.PI * radius) / spacingTarget));

    // Simple stagger: alternate start angle slightly for even/odd rings
    const angleStep = (2 * Math.PI) / slots;
    let startAngle = -Math.PI / 2 + (currentRing % 2 === 1 ? angleStep / 2 : 0); // Start top, stagger

    const itemsInThisRing = Math.min(slots, events.length); // How many we can actually place

    for (let i = 0; i < itemsInThisRing; i++) {
      const angle = startAngle + i * angleStep;
      const el = events.shift(); // Take the next event panel

      if (!el) continue; // Should not happen, but safety check

      // Get panel dimensions (ensure they are rendered)
      const elWidth = el.offsetWidth || 150; // Provide fallback width
      const elHeight = el.offsetHeight || 100; // Provide fallback height

      // Calculate top-left position relative to node center
      const x = nodeCenterX + radius * Math.cos(angle) - elWidth / 2;
      const y = nodeCenterY + radius * Math.sin(angle) - elHeight / 2;

      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = 'scale(1)'; // Reset any potential scaling

      // Apply transition ONLY if requested
      el.style.transition = useTransition ? 'left 0.3s ease, top 0.3s ease' : 'none';

      placed++;
    }

    // If no slots were available but events remain (e.g., radius too small),
    // still increment ring to prevent infinite loop.
    if (itemsInThisRing === 0 && events.length > 0) {
        console.warn("Orbit layout: Could not place events, radius might be too small or spacing too large for ring", currentRing);
        currentRing++;
        // Optionally, break here or implement a fallback (e.g., stacking)
        break; // Prevent potential infinite loop if items can't be placed
    } else if (itemsInThisRing > 0) {
       currentRing++;
    }
    // If events.length is 0, the loop condition handles termination.
  }
}

// The displaceEventsAroundFocused function remains the same, but note that
// it might need similar coordinate adjustments if used with scaled containers.
export function displaceEventsAroundFocused(targetEl, nodeEl, allEventEls, bumpRadius = 80) {
  const focusX = parseFloat(targetEl.style.left) + targetEl.offsetWidth / 2;
  const focusY = parseFloat(targetEl.style.top) + targetEl.offsetHeight / 2;

  allEventEls.forEach(el => {
    if (el === targetEl) return;

    const elCenterX = parseFloat(el.style.left) + el.offsetWidth / 2;
    const elCenterY = parseFloat(el.style.top) + el.offsetHeight / 2;

    const dx = elCenterX - focusX;
    const dy = elCenterY - focusY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < bumpRadius && dist > 0.1) { // Avoid division by zero
      const bumpFactor = (bumpRadius - dist) / bumpRadius; // 0 to 1
      const pushX = dx / dist * bumpFactor * 30;
      const pushY = dy / dist * bumpFactor * 30;

      // Use transitions for the bump effect
      el.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
      el.style.left = `${parseFloat(el.style.left) + pushX}px`;
      el.style.top = `${parseFloat(el.style.top) + pushY}px`;
    } else {
       // Optional: Reset transition if not being pushed
       // el.style.transition = 'none'; // Or revert to default layout transition
    }
  });
}