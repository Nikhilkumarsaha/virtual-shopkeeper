(function () {
  const container = document.getElementById("remix-widget-container");
  if (container) {
    container.innerHTML = `
      <div style="padding:1rem; border:2px solid #ddd;">
        <h3>Hello from Remix 🎉</h3>
        <p>Content loaded via your local app using ngrok.</p>
      </div>
    `;
  }
})();
