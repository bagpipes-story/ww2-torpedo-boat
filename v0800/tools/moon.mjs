import * as A from 'astronomy-engine';
function fmt(t, tz) { if (!t) return '—'; const d = new Date(t.date.getTime() + tz*3600e3); return d.toISOString().replace('T',' ').slice(0,16) + ` (UTC${tz>=0?'+':''}${tz})`; }
function run(name, lat, lon, startIso, tz) {
  const obs = new A.Observer(lat, lon, 0);
  const t0 = A.MakeTime(new Date(startIso));
  const ev = [];
  const sunset = A.SearchRiseSet(A.Body.Sun, obs, -1, t0, 2);
  const naut = A.SearchAltitude(A.Body.Sun, obs, -1, t0, 2, -12);
  const sunrise = A.SearchRiseSet(A.Body.Sun, obs, +1, sunset, 2);
  const nautM = A.SearchAltitude(A.Body.Sun, obs, +1, sunset, 2, -12);
  const civM = A.SearchAltitude(A.Body.Sun, obs, +1, sunset, 2, -6);
  const moonset = A.SearchRiseSet(A.Body.Moon, obs, -1, t0, 2);
  const moonrise = A.SearchRiseSet(A.Body.Moon, obs, +1, t0, 2);
  const mid = A.MakeTime(new Date(sunset.date.getTime() + 6*3600e3));
  const ill = A.Illumination(A.Body.Moon, mid);
  const phase = A.MoonPhase(mid);
  console.log(`== ${name} (${lat}, ${lon})`);
  console.log(' sunset', fmt(sunset,tz), ' naut dusk end', fmt(naut,tz));
  console.log(' naut dawn', fmt(nautM,tz), ' civil dawn', fmt(civM,tz), ' sunrise', fmt(sunrise,tz));
  console.log(' moonset', fmt(moonset,tz), ' moonrise', fmt(moonrise,tz));
  console.log(` phase angle(ecl lon diff) ${phase.toFixed(1)}°, illuminated ${(ill.phase_fraction*100).toFixed(1)}% at ${fmt(mid,tz)}`);
  // hourly moon altitude through the night
  let s = '';
  for (let h = 0; h <= 12; h++) {
    const t = A.MakeTime(new Date(sunset.date.getTime() + h*3600e3));
    const eq = A.Equator(A.Body.Moon, t, obs, true, true);
    const hor = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
    s += ` ${fmt(t,tz).slice(11,16)}:${hor.altitude.toFixed(0)}°`;
  }
  console.log(' moon alt after sunset:' + s);
  const nm = A.SearchMoonPhase(0, A.MakeTime(new Date(startIso)), -20); const fm = A.SearchMoonPhase(180, A.MakeTime(new Date(startIso)), -20);
  const nm2 = A.SearchMoonPhase(0, A.MakeTime(new Date(startIso)), 20); const fm2 = A.SearchMoonPhase(180, A.MakeTime(new Date(startIso)), 20);
  console.log(' prev new', fmt(nm,0), 'prev full', fmt(fm,0), 'next new', fmt(nm2,0), 'next full', fmt(fm2,0));
}
// Blackett Strait night of 1-2 Aug 1943 (local UTC+11). start search at 1943-08-01 12:00 local = 01:00 UTC
run('Blackett Strait 1943-08-01/02', -8.08, 156.97, '1943-08-01T01:00:00Z', 11);
// Surigao Strait south entrance / Bohol area night 24-25 Oct 1944, local UTC+8 (also +9)
run('Surigao Strait 1944-10-24/25', 10.0, 125.35, '1944-10-24T04:00:00Z', 8);
run('Bohol/Camiguin first contact area', 9.55, 124.95, '1944-10-24T04:00:00Z', 8);
// Palompon 1944-12-11/12
run('Palompon 1944-12-11/12', 11.05, 124.38, '1944-12-11T04:00:00Z', 8);
// Utah Beach 1944-06-05/06 (BDST UTC+2)
run('Utah Beach 1944-06-05/06', 49.45, -1.17, '1944-06-05T12:00:00Z', 2);
