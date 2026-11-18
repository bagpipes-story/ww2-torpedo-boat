import * as A from 'astronomy-engine';
const obs = new A.Observer(9.6, 124.5, 0); // 南ボホール沖（第1分隊の付近の見当）
const t0 = A.MakeTime(new Date('1944-10-24T04:00:00Z'));
const f = (t, tz) => new Date(t.date.getTime() + tz*3600e3).toISOString().slice(0,16).replace('T',' ');
const ss = A.SearchRiseSet(A.Body.Sun, obs, -1, t0, 2);
const ms = A.SearchRiseSet(A.Body.Moon, obs, -1, t0, 2);
const mr = A.SearchRiseSet(A.Body.Moon, obs, +1, t0, 2);
const sr = A.SearchRiseSet(A.Body.Sun, obs, +1, ss, 2);
console.log('sunset', f(ss,8), '(+8)', f(ss,9), '(+9)');
console.log('moonset', f(ms,8), '(+8)', f(ms,9), '(+9)');
console.log('moonrise', f(mr,8), '(+8)');
console.log('sunrise', f(sr,8), '(+8)', f(sr,9), '(+9)');
for (const utc of ['1944-10-24T13:36:00Z','1944-10-24T13:50:00Z','1944-10-24T14:36:00Z','1944-10-24T14:50:00Z']) {
  const t = A.MakeTime(new Date(utc));
  const eq = A.Equator(A.Body.Moon, t, obs, true, true);
  const h = A.Horizon(t, obs, eq.ra, eq.dec, 'normal');
  const ill = A.Illumination(A.Body.Moon, t);
  console.log(utc, 'local+8', f(t,8), '+9', f(t,9), 'alt', h.altitude.toFixed(1), 'az', h.azimuth.toFixed(0), 'illum', (ill.phase_fraction*100).toFixed(1)+'%');
}
