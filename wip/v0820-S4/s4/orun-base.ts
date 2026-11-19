import { createHash } from 'node:crypto';
import { otherBriefingsJson, OTHER_BRIEFING_IDS } from './okit-base';
const j = otherBriefingsJson();
console.log('base', OTHER_BRIEFING_IDS.length, j.length, createHash('sha256').update(j).digest('hex'));
