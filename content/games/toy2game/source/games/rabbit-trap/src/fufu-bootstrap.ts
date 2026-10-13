import '../../../packages/fufu-bridge/fufu.css';
import { installLevels } from './levels';
import { readLevels } from '../../../packages/fufu-bridge/index';
import { initializeGame } from '../../../packages/fufu-bridge/index';
initializeGame('rabbit-trap').then(() => { installLevels(readLevels()); return import('./main'); }).catch(error => { document.body.innerHTML = '<main style="padding:32px;font:16px system-ui"><h1>游戏暂时没能打开</h1><p></p><button onclick="location.reload()">重新加载</button></main>'; document.querySelector('p')!.textContent=error.message; });
