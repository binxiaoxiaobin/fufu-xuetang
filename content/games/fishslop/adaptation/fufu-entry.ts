import { initialize, report } from './fufu-storage';

try {
  await initialize();
  await import('./main');
} catch (error) {
  const message = error instanceof Error ? error.message : '请重新加载游戏';
  report('fufu-toy-error', message);
  const note = document.getElementById('webgl-error');
  if (note) { note.hidden = false; note.textContent = message; }
  const button = document.getElementById('btn-dive') as HTMLButtonElement;
  button.disabled = false;
  button.textContent = '重新加载';
  button.onclick = () => location.reload();
}
