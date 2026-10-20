// 敵の米PT の隊の段階と運動（v0.6.3。docs/02 §6.4、spec §C.5〜C.6）。Phaser 非依存。数値は core/pt-data の PtParams。
// 乱数は seed+18 の系列だけ（射撃の散布と命中の火災・機関。AI は引かない）。

/** 米PT の乱数の系列（seed+18。+17 は見張り、+16 は今夜の揺らぎ、+19 は夜明けの空襲） */
export const PT_SEED_OFFSET = 18;
