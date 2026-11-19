import { gameData } from '/home/user/ww2-torpedo-boat/src/config/game-data';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '/home/user/ww2-torpedo-boat/src/config/briefing-data';
import { briefingRows, formatDateJa } from '/home/user/ww2-torpedo-boat/src/core/briefing';
import { directSortie } from '/home/user/ww2-torpedo-boat/src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '/home/user/ww2-torpedo-boat/src/systems/world-setup';
const id = process.argv[2] ?? 'us_05';
for (const hard of [false, true]) {
  const setup = buildWorldSetup(gameData, id, { sortie: directSortie(id, 1, 'none', hard, false), hard });
  const r = getBriefingRecord(gameData, id, hard);
  const rec = { ...r, hazardIds: setup.hazardsTonight, absentHazardIds: setup.absentHazards };
  console.log(hard, r.titleJa, formatDateJa(r.date), r.place, '|', r.noteJa);
  for (const row of briefingRows(rec, briefingNumbers(setup, '見越し点マーカー 使用可'), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h))) console.log('  ', row.label, ':', row.text);
}
