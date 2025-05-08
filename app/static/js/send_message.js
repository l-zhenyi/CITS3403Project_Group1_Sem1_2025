document.addEventListener("DOMContentLoaded", () => {
    const container = document.querySelector(".message-form-container");
    if (container) {
        requestAnimationFrame(() => container.classList.add("animate-in"));
    }
});