(function () {
  // Create the chat bubble
  const bubble = document.createElement('div');
  bubble.id = 'remix-chat-bubble';
  bubble.style.position = 'fixed';
  bubble.style.bottom = '24px';
  bubble.style.right = '24px';
  bubble.style.width = '60px';
  bubble.style.height = '60px';
  bubble.style.background = '#008060';
  bubble.style.borderRadius = '50%';
  bubble.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  bubble.style.display = 'flex';
  bubble.style.alignItems = 'center';
  bubble.style.justifyContent = 'center';
  bubble.style.cursor = 'pointer';
  bubble.style.zIndex = '9999';
  bubble.innerHTML = '<span style="color:white;font-size:2rem;">💬</span>';

  // Create the modal/iframe
  const modal = document.createElement('div');
  modal.id = 'remix-chat-modal';
  modal.style.position = 'fixed';
  modal.style.bottom = '100px';
  modal.style.right = '24px';
  modal.style.width = '400px';
  modal.style.height = '600px';
  modal.style.background = 'white';
  modal.style.borderRadius = '16px';
  modal.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)';
  modal.style.display = 'none';
  modal.style.flexDirection = 'column';
  modal.style.overflow = 'hidden';
  modal.style.zIndex = '10000';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerText = '×';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '8px';
  closeBtn.style.right = '16px';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '2rem';
  closeBtn.style.cursor = 'pointer';
  closeBtn.onclick = () => { modal.style.display = 'none'; };

  // Iframe for the assistant
  const iframe = document.createElement('iframe');
  iframe.src = 'https://4e87-2401-4900-8fd2-60e-50f9-f31f-4379-e036.ngrok-free.app /widget-assistant';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  modal.appendChild(closeBtn);
  modal.appendChild(iframe);

  // Show modal on bubble click
  bubble.onclick = () => { modal.style.display = 'flex'; };

  // Add to page
  document.body.appendChild(bubble);
  document.body.appendChild(modal);
})();
