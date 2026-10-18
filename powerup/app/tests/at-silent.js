document.getElementById('jump-hold').click();
const w = document.getElementById('tlWrap'); w.focus();
for (let i = 0; i < 4; i++) w.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }));
document.getElementById('a-mesh').click();
