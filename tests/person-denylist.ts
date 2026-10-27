// 人物名を出さない（CLAUDE.md §11）検査の共通の表（v0.6.1 で briefing.test.ts から移した。dawn-air.test.ts も使う）。テストではない（vitest は *.test.ts だけ拾う）。

/** 人物名の denylist と階級つきの呼び方（v0.6.7: research-v067 の 1-14・1-15 に FAW-2 の司令官の名が出たので Price・プライスを足した。階級の付かない名前は RANK_RE では拾えない） */
export const PERSON_DENYLIST = ['マッカーサー', 'MacArthur', 'ケネディ', 'Kennedy', 'バルクリー', 'Bulkeley', 'Bulkley', '白石', '齋藤', 'Price', 'プライス'];
export const RANK_RE = /[一-龥ァ-ヶ]{1,6}(中尉|大尉|少佐|中佐|大佐|少将|中将|大将|艇長)/;
