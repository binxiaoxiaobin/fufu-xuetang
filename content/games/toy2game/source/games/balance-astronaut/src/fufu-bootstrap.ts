import '../../../packages/fufu-bridge/fufu.css';
import { initializeGame } from '../../../packages/fufu-bridge/index';
initializeGame('balance-astronaut').then(() => import('./main')).catch(error => { document.body.innerHTML = '<main style="padding:32px;font:16px system-ui"><h1>游戏暂时没能打开</h1><p></p><button onclick="location.reload()">重新加载</button></main>'; document.querySelector('p')!.textContent=error.message; });
