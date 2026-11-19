import { createHash } from 'node:crypto';
import { otherBriefingsJson, OTHER_BRIEFING_IDS } from './okit-cur';
const j = otherBriefingsJson();
console.log('cur', OTHER_BRIEFING_IDS.length, j.length, createHash('sha256').update(j).digest('hex'));
