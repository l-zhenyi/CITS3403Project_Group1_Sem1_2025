//Messages slide in when user enters the page asap
document.addEventListener("DOMContentLoaded", () => {
    const messages = document.querySelectorAll(".chat-message");

    messages.forEach((msg, index) => {
        setTimeout(() => {
            msg.classList.add("animate-in");
        }, 100 * index); 
    });
});

//page link slides in when user enters the page asap
document.addEventListener("DOMContentLoaded", () => {
    const links = document.querySelectorAll(".pager-link");

    links.forEach((link, index) => {
        // Apply animation with slight delay between each
        setTimeout(() => {
            link.classList.add("animate-in");
        }, 100 * index);
    });
});

//white background fades in when user entersw the page asap
document.addEventListener("DOMContentLoaded", () => {
    const chatContainer = document.querySelector(".chat-container");
    if (chatContainer) {
        requestAnimationFrame(() => chatContainer.classList.add("fade-in"));
    }
});
