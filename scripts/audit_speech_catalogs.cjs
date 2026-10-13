// Read-only extraction of active narration templates, without browser/3D initialization.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..'), fe = path.join(root, 'frontend');
const collector = fs.readFileSync(path.join(__dirname, 'tts_collect.js'), 'utf8');
const helper = collector.slice(collector.indexOf('function extractBalanced'), collector.indexOf('// ---------- 1)'));
const extract = new Function(helper + ';return extractBalanced;')();
const literal = (file, anchor) => new Function('return (' + extract(fs.readFileSync(path.join(fe, file), 'utf8'), anchor) + ')')();
const numberText = n => String(Number(n.toFixed(2)));
(async () => {
  const rows = [];
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(fe,'china-provinces.js'),'utf8'), context);
  const provinces = context.window.FufuChinaProvinces.PROVINCES;
  for (const p of provinces)
    rows.push({group:'china_province_narration', owner:p.name, text:`${p.name}，简称${p.short}。${p.intro} ${p.facts.join(' ')}`});
  const dinosaurs = literal('exploration-modules.js', 'const dinosaurs =');
  for (const d of Object.values(dinosaurs).flat()) {
    const s = d.size, sizeText = s ? `它有多大呢？${s.mainLabel}大约 ${numberText(s.lengthM)} 米，${s.heightLabel}大约 ${numberText(s.heightM)} 米，体重${s.weight}。${s.compare}` : '';
    rows.push({group:'dinosaur_narration', owner:d.name, text:`${d.name}。${d.description}。观察重点是${d.feature}。食物或能量来源主要是${d.diet}。${sizeText}`});
  }
  const engineering = await import(pathToFileURL(path.join(fe,'engineering-data.js')).href);
  for (const m of engineering.MACHINES) {
    const s=m.size, sizeText=s ? (s.metrics ? `它有多精细呢？${s.metrics.map(([k,v])=>`${k} ${v}`).join('，')}。${s.note}` : `它有多大呢？${s.mainLabel}大约 ${numberText(s.lengthM)} 米，${s.heightLabel}大约 ${numberText(s.heightM)} 米，重量${s.weight}。${s.compare}`) : '';
    rows.push({group:'engineering_narration', owner:m.name, text:`${m.name}，${m.latin}。${m.intro}它主要用来${m.facts[0][1]}。${sizeText}`});
  }
  process.stdout.write(JSON.stringify(rows));
})();
