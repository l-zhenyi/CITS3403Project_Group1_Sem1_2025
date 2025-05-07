//Messages slide in when user enters the page asap
document.addEventListener("DOMContentLoaded", () => {
    const messages = document.querySelectorAll(".chat-message");

    messages.forEach((msg, index) => {
        setTimeout(() => {
            msg.classList.add("animate-in");
        }, 100 * index); 
    });
});
