/* Keep the mobile app out of desktop sessions, including narrow windows. */
const desktop = matchMedia('(hover: hover) and (pointer: fine)');
let started = false;

async function enter() {
  if (desktop.matches || started) return;
  started = true;
  try {
    await import('./main.js');
  } catch {
    started = false;
    const boot = document.querySelector('#boot');
    if (boot) {
      boot.replaceChildren();
      const message = document.createElement('p');
      message.textContent = 'Couldn’t open udhaar. Check your connection and reload.';
      const retry = document.createElement('button');
      retry.className = 'btn btn--outline';
      retry.textContent = 'Try again';
      retry.onclick = () => location.reload();
      boot.append(message, retry);
    }
  }
}

document.querySelector('.desktop-gate__address').textContent = location.host;
desktop.addEventListener('change', enter);
enter();
