document.addEventListener("DOMContentLoaded", () => {
    const profile = document.querySelector(".profile-container");
    if (profile) {
        requestAnimationFrame(() => {
            profile.classList.add("animate-in");
        });
    }
});
