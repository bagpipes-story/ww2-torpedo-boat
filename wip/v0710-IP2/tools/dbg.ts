import { LAUNCH_VARIANTS } from '/home/user/ww2-torpedo-boat/src/assets/sfx-recipes-launch';
const x = LAUNCH_VARIANTS[0]!.recipe(22050);
let m1 = 0, m2 = 0, a2 = 0; for (let i = 0; i < 220; i++) m1 = Math.max(m1, Math.abs(x[i]!)); for (let i = 220; i < 22050; i++) if (Math.abs(x[i]!) > m2) { m2 = Math.abs(x[i]!); a2 = i; }
console.log(m1, m2, a2);
