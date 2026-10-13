const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const ts=require(path.join(root,'artifacts/sunbreak-build/node_modules/typescript'));
const base=fs.readFileSync(path.join(root,'content/games/fishslop/adaptation/fufu-storage.ts'),'utf8');
for(const game of ['starcatcher','palace-for-fools','little-spy','taipo','sokoworld','open-jigsaw']){
  const folder=path.join(root,'frontend/assets/games',game);fs.mkdirSync(folder,{recursive:true});
  let source=base.replaceAll('fishslop',game).replaceAll('海底进度','游戏进度').replaceAll('你的海底世界','你的游戏进度');
  source=source.replace('async function close()','export async function closeGame()').replace('void close();','void closeGame();');
  source=source.replace("window.dispatchEvent(new Event('fufu-game-close'));\n  try {", "window.dispatchEvent(new Event('fufu-game-close'));\n  try {\n    await (window as any).fufuBeforeClose?.();");
  source+='\nexport function getLearnerId() { return learnerId; }\n';
  fs.writeFileSync(path.join(folder,'fufu-storage.js'),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020}}).outputText);
}
