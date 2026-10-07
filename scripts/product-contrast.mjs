// Runs inside the browser. Resolve modern CSS colors and composite transparent
// surfaces so theme checks measure rendered color pairs, including SVG icons.
export function productContrast() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const paint = canvas.getContext('2d', { willReadFrequently: true });
  const color = value => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    const channels = [...paint.getImageData(0, 0, 1, 1).data];
    return [...channels.slice(0, 3), channels[3] / 255];
  };
  const over = (fg, bg) => fg.slice(0, 3).map((value, i) => value * fg[3] + bg[i] * (1 - fg[3]));
  const luminance = channels => channels.map(value => value / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
  const failures = [];
  for (const element of document.querySelectorAll('#app *')) {
    const icon = element.matches('svg.nucleo-sharp');
    if (!icon && (element.closest('svg') || ![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()))) continue;
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    if (!element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }) || !box.width || !box.height || box.bottom <= 0 || box.top >= innerHeight) continue;
    const layers = [];
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) layers.unshift(color(getComputedStyle(ancestor).backgroundColor));
    const background = layers.reduce((bg, fg) => over(fg, bg), [255, 255, 255]);
    const path = icon && element.querySelector('[stroke="currentColor"], [fill="currentColor"]');
    const ink = path ? getComputedStyle(path)[path.getAttribute('stroke') === 'currentColor' ? 'stroke' : 'fill'] : style.color;
    const f = luminance(over(color(ink), background)), b = luminance(background);
    const ratio = (Math.max(f, b) + .05) / (Math.min(f, b) + .05);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseFloat(style.fontWeight) >= 700);
    const minimum = icon || large ? 3 : 4.5;
    if (ratio < minimum) failures.push({ element: element.getAttribute('class') || element.tagName, text: element.textContent.trim().slice(0, 50), ink, ratio: +ratio.toFixed(2), minimum });
  }
  return failures;
}
