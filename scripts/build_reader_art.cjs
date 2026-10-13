/* Export our own vector illustrations into the project's asset directory. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),seed=path.join(root,'backend/seed_data/reader_lessons.json');
const units=JSON.parse(fs.readFileSync(seed,'utf8').replace(/^\uFEFF/,''));
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'frontend/reader-scenes.js'),'utf8'),sandbox);
const directory=path.join(root,'frontend/assets/interface/reader-vocabulary');
fs.mkdirSync(directory,{recursive:true});
for(const item of units){
  const svg=sandbox.window.FufuReaderScene(item.scene,item.word,false).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
  const name=item.question_id+'-'+crypto.createHash('sha256').update(svg).digest('hex').slice(0,10)+'.svg';
  fs.writeFileSync(path.join(directory,name),svg);
  item.scene_image='/assets/interface/reader-vocabulary/'+name;
}
fs.writeFileSync(seed,JSON.stringify(units,null,2));
console.log('Exported',units.length,'local illustrations.');
