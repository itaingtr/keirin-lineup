# 保存データからページを作る

表示のひな形は `templates/race-page.html`、データ検証・生成処理は `scripts/render_races.py` です。
Kドリームスに再接続しなくても、保存済みJSONから何度でも生成できます。Python 3の標準機能だけで動きます。

既存の公開ページから、すでに掲載されている値をJSONへ取り出す場合:

```sh
python3 scripts/export_races.py site/index.html --output private-snapshots/2026-10-17.json
```

これは元サイトの新規取得ではありません。元ページですでに丸められた数値の小数部分も復元できません。
`private-snapshots/` はGit管理・Pages公開対象外です。ActionsからSupabaseの非公開Storageへの保存・読み戻しは2026-10-18に接続確認済みです。詳細は `CARD_AUTOMATION.md` を参照してください。
ローカルだけに置いたファイルは自動転送されないため、別環境へ移す前には非公開バックアップを保存してください。
保存方針は最低5年・自動削除なしです。5年後も自動では削除せず、削除前にユーザーへのデータ提供と明示的な許可が必要です。
定時取得データはSupabaseへ追記します。外部バックアップやホスティング契約の継続まで含めた5年間の保管保証を完了した意味ではありません。

まずプレビュー用の別ディレクトリに生成できます:

```sh
python3 scripts/render_races.py private-snapshots/2026-10-17.json --site-dir /tmp/keirin-preview
```

本番の2ファイルを生成する場合:

```sh
python3 scripts/render_races.py private-snapshots/2026-10-17.json
```

更新するのは `site/index.html` とJSON内の日付に対応する `site/lineYYYYMMDD.html/index.html` だけです。
GitHubへのcommit/pushは別操作です。既存の過去ページは書き換えません。
日付リストには、既存ページ・対象日・翌日のリンクを入れます。翌日ページ自体を勝手に複製はしません。

## AIが取得後に用意するJSON

```json
{
  "schema_version": 1,
  "target_date": "2026-10-17",
  "expected_races": 1,
  "races": [{
    "venue": "京王閣",
    "race": 1,
    "source": "https://my.keirin.kdreams.jp/keiokaku/racedetail/2720261017010001/",
    "race_type": "Ｓ級一予選",
    "grade_code": 3,
    "start_time": "15:23",
    "lineup": "1-2/3",
    "players": [
      {"no": 1, "name": "表示例一", "score": 105.25, "period": 115, "mark": "◎", "stats": [5, 12, 6, 2, 1, 0]},
      {"no": 2, "name": "表示例二", "score": 103.10, "period": 113, "mark": "○", "stats": [2, 0, 0, 1, 4, 2]},
      {"no": 3, "name": "表示例三", "score": 99.60, "period": 101, "mark": "", "stats": [1, 6, 2, 3, 0, 0]}
    ]
  }]
}
```

この例は架空の選手データです。本番には取得・照合済みの全選手を入れます。
`stats` は S / B / 逃 / 捲 / 差 / マ の順です。未取得を0で埋めず、6項目すべて確認します。
`expected_races` は取得元で確認した対象レース数を記録します。生成側だけでは取得漏れの有無を判断できません。
`grade_code` は元サイトで確認したコード、`source` はレース詳細URL、`start_time` は24時間形式です。
時刻未発表だけは空文字で表せます。並びの `/` は別ライン、`7(38)(46)/1/5/29` の括弧は競りです。

レース日付・レース番号・選手重複・並びの欠落や重複・成績不足・不正URLなどは生成前に拒否します。
空のデータで既存ページを消すことはしません。グレード順、映像直リンク、成績の赤表示、スマホの配置、
16pxの入力文字、750×470のPC映像ポップアップをひな形に含めています。
コメント本文と認証状態は、従来どおりブラウザがSupabaseから読み込みます。JSONには含めません。

今後レイアウトを変更するときはひな形を修正し、対象日データからこのコマンドで2ページを再生成してください。

検証:

```sh
python3 -m unittest discover -s tests -v
```

17日版19レース・157人をJSONから再生成し、元HTMLが作る出走表DOM・検索結果と一致することを確認済みです。
ブラウザ実機でのスクリーンショット比較ではありません。定時実行・元サイト取得・非公開保存の手順と接続条件は `CARD_AUTOMATION.md` を参照してください。

二車単のページ内開閉表示と実データ取得先については `ODDS.md` を参照してください。
ひな形は対象日とトップに `odds-current.js` を読み込みます。以前の日付のページの `odds.js` は維持します。実オッズはActionsで取得した公開用JSONに接続済みで、出走表のS回数より上にも取得済みのライン正逆オッズと単勝想定を初期表示します。元サイトの常時自動取得ではなく、観測時刻付きの保存値を表示します。
