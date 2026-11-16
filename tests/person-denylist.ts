// 人物名を出さない（CLAUDE.md §11）検査の共通の表（v0.6.1 で briefing.test.ts から移した。dawn-air.test.ts も使う）。テストではない（vitest は *.test.ts だけ拾う）。

/**
 * 人物名の denylist と階級つきの呼び方（v0.6.7: research-v067 の 1-14・1-15 に FAW-2 の司令官の名が出たので Price・プライスを足した。階級の付かない名前は RANK_RE では拾えない）。
 * v0.8.0 S0（spec-v0800 §4.12）: us_04（1943-08-01〜02 のブラケット海峡）の夜の逸話に出る島民 2 人の名（ラテン文字と片仮名。名と姓に分けて拾う）を足した
 */
export const PERSON_DENYLIST = ['マッカーサー', 'MacArthur', 'ケネディ', 'Kennedy', 'バルクリー', 'Bulkeley', 'Bulkley', '白石', '齋藤', 'Price', 'プライス', 'Biuku', 'Gasa', 'ビウク', 'ガサ', 'Eroni', 'Kumana', 'エロニ', 'クマナ'];
export const RANK_RE = /[一-龥ァ-ヶ]{1,6}(中尉|大尉|少佐|中佐|大佐|少将|中将|大将|艇長)/;
/** その夜に駆逐艦に体当たりされた有名な艇の番号（v0.8.0 S0。spec-v0800 §4.12。URL の小文字・空白・ハイフンの有無も拾う）。us_04 の文と data に出さない */
export const FAMOUS_BOAT_RE = /PT-?\s*109/i;
