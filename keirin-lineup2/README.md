# keirin-lineup2

既存の `itaingtr/keirin-lineup` と独立した予備サイトです。元のレイアウト・左右2表・合成オッズ・検索を引き継ぎ、トップ・10月22日版・10月21日版では競走成績・映像・ライブを同じページ内で表示します。元サイトと過去ページは変更しません。

## 取得元

- 優先候補のエンジョイは、2026-10-22のGitHub Actionsでトップ・出走表ともHTTP 404でした。Web検索で閲覧できることを、自動取得成功とは扱いません。URLの検証・描画は対応しますが、自動収集は未接続です。
- 今回の実働候補はWINTICKETです。ログアウト状態の公開ページ内の `__PRELOADED_STATE__` に含まれる出走表・並び・二車単を読みます。非公開API、ログイン、Kドリームスのデータやフィードには接続しません。
- WINTICKETの選手成績を、同じページの出走表の表示値とも照合します。選手名・期別・直近4か月得点・S/B/逃/捲/差/マは元の数値を保持し、描画時だけ得点を整数表示します。予想印のない選手は空欄です。
- 二車単の順序付き `key: [1,2]` を1着1番・2着2番として扱います。全組合せ・車番・賭式・レースIDを検証し、元の `oddsUpdatedAt` を観測時刻として保ちます。取得失敗を0やnullで埋めません。
- 出走表・並びが欠けた開催は丸ごと除外し、通信や検証に失敗したら既存の表示を保持します。Kドリームスの値を別取得元として付け替えません。

各サイトの公開情報を読めることは、自動取得・保存・転載の一般的な許諾の証明ではありません。今回の確認は独立した試作です。転載権限・収集頻度等の条件を確認せずに無人の一般公開運用へ進めません。記事、写真、予想本文は転載しません。

## 映像

10月21日版では、映像・ライブ・過去の着順を出走表に重ねた `dialog` 内で表示します。ページURLを変えず、別タブ・別ウィンドウやアプリへ自動移動しません。「閉じる」またはEscで元の出走表に戻り、再生・音声・通信も止めます。過去成績は同じ枠内で競走成績と映像を切り替えられます。

`/api/media` はクリック時にWINTICKETのログアウト状態の公開ページから配信先だけを確認します。このサイトの出走表と保存済み競走成績に載るレース、および掲載場のライブだけを許可し、任意のURLを取得する機能は持ちません。ブラウザーのCookie・認証情報は送らず、ログイン不要の公開状態とレースIDを確認します。レスポンスは最大6MB、通信は12秒、短いキャッシュは30秒です。公開済みMP4と当該場のHLSだけを再生し、映像ファイル自体は保存しません。未公開・時間外・通信失敗を区別して表示し、再試行もページ内で行います。

映像情報と予想印は `scripts/collect_media.py` が既存出走表とレース・車番・選手名を照合し、新規の非公開スナップショットに追記・読み戻し後、表示用 `site/media.json` に反映します。放送IDは開催初日ではなく当日のYYYYMMDDを使うため、開催2日目以降も対応します。AI予想の公開順位を上から◎・○・▲・△で表示し、元サイトの予想印とは取得元が異なることをページにも明記しています。得点・成績・オッズの保存値は変更しません。

出走表・オッズ・保存済みの結果表の自動更新はまだ設定していません。動画の配信先は閲覧時に確認し直すため、古い一覧では未公開だった映像も、公式で公開された後は再取得して再生します。

## 今場所の成績

各選手の差・マの下に、WINTICKETの「直近成績 → 今場所」に含まれる前日までの成績を、初日から順に縦に表示します。1日につき「着順＋B」「個人あがり」の2段です。Bはそのレースのバック取得で、上段にある直近4か月の累計Bとは区別します。着順の白丸・黒丸は公式の `displayType`（0=通常、1=白丸、2=黒丸）を維持します。

着順を押すと、そのレース全員の競走成績をページ内に表示し、選んだ選手の行を公式と同じ `#CAFEE3` の緑にします。保存原本の `result_url` は変えません。補助のリンク先には公式と同じ `?playerIds={選手ID}` を保ちますが、通常のクリックはページ内で処理します。

熊本は2026-10-22開催の初日のため、前日までの今場所成績はありません。空欄に見えないよう「初日」と明示します。9車の並びはスマートフォン幅で間隔を調整し、並び欄で選手や成績を切り落とす `overflow:hidden` を解除しています。

選手IDと氏名、着順、B、個人あがり、事故区分をリンク先の公式結果とも照合済みです。他開催の成績、今日の結果、将来日の結果を混ぜません。初日は「—」、途中参加などで掲載がない日も「—」です。中止などは公式の「未」等を表示し、個人あがりが記録されていない0.0等は「—」と表示します。原本の値は変更しません。小数桁は元の文字列をそのまま保ちます。

`scripts/collect_sources.py` と `scripts/render_races.py` は新規出走表にもこの項目を引き継ぎます。既存出走表に対する追加取得は次の手順です。

```sh
python3 scripts/collect_history.py private-snapshots/new-card.json \
  --snapshot private-snapshots/new-history.json --display /tmp/new-history-display.json
python3 scripts/archive_snapshot.py --date 2026-10-22 \
  --input private-snapshots/new-history.json --report private-snapshots/new-history-usage.json
```

原本は既存Actions接続で非公開に新規追記し、読み戻し後に表示へ反映します。2026-10-22の[実取得・照合](https://github.com/itaingtr/keirin-lineup/actions/runs/39739079219)で、26レース・204人、今場所143成績、リンク先21レース、B取得19件を確認しました。既存の得点・成績・オッズ・コメントの値は保ちます。

## 収集と生成

```sh
python3 scripts/collect_sources.py --date 2026-10-22 \
  --snapshot private-snapshots/new-card.json --feed private-snapshots/new-feed.json
python3 scripts/archive_snapshot.py --date 2026-10-22 \
  --input private-snapshots/new-card.json --report private-snapshots/new-usage.json
python3 scripts/render_races.py private-snapshots/new-card.json --site-dir /tmp/keirin-lineup2-preview
```

原本の正規化データ・取得元URL・時刻は、既存Actions secret `SNAPSHOT_SUPABASE_SERVICE_KEY` を使い、既存の非公開バケットへ固有名で追記して読み戻します。キーをローカルへ取り出す必要はありません。上書き・削除・自動期限を設定しません。最低5年保管し、容量不足なら新規保存と公開を止めます。

`site/` に置くのは表示用HTML、表示に必要なオッズJSONと公開用アセットだけです。原本をGitや公開ファイルへ含めません。

`write_pages` は異なる内容の既存ページを上書きしません。再取得の検証には新しい出力ディレクトリを使います。各検証のプレビューと取得フィードは実行別に新規保存します。

## コメント

既存の公開キーと掲示板を利用し、レースの識別キーを従来の形式へ変換して同じレースのコメントを参照します。既存投稿や認証設定は変更しません。メールログインの戻り先は、既存の許可済み本サイトのままです。別ドメインでのログイン往復は未検証です。

本サイトと重なる2026-10-22の19レースは投稿キーの完全一致を確認済みです。投稿はページ読み込み・投稿後・認証状態の変更時に取得します。Realtime購読はなく、別サイトの新規投稿を見るには再読み込みが必要です。Sitesの閲覧は引き続き所有者のみで、所有者のChatGPTログインが必要です。

## 検証

```sh
python3 -m unittest discover -s tests -v
node --check site/odds-current.js
node --check site/odds-comparison.js
NODE_PATH=/tmp/keirin-lineup2-validation/node_modules node tests/test_display.cjs
NODE_PATH=/tmp/keirin-lineup2-validation/node_modules node tests/test_watch.cjs
NODE_PATH=/tmp/keirin-lineup2-validation/node_modules node tests/test_viewer.cjs
python3 scripts/build_site.py
node tests/test_worker.cjs
```

自動スケジュールはまだ設定しません。実データの取得・非公開保存・描画が通ってから、運用先に合わせて接続します。

2026-10-22の[Actions実取得](https://github.com/itaingtr/keirin-lineup/actions/runs/39732794697)で、26レース・204人・二車単1,428通りの取得、出走表との照合、非公開追記と読み戻し、表示ファイルの生成に成功しました。jsdom@26.1.0でトップと日付ページ、左右2表の全セル計5,712回、検索、映像・ライブURLを検証しました。既存の左右表示処理とレイアウトを維持し、今場所の小さな縦表示用スタイルを追加しています。実機での動画再生は未検証です。

直接再生対応は[Actions検証](https://github.com/itaingtr/keirin-lineup/actions/runs/39737127058)で、26レースの本人照合、公開済みMP4 17本のHTTP 206応答、3場のHLS本体・画質別プレイリストのHTTP 200と予備サイト向けCORS、AI予想印104個を確認しました。jsdomで3場の選択、MP4・標準HLS・hls.jsの分岐、再生許可待ち、配信時間外、未公開映像、通信失敗と不正URLの拒否を確認しています。実機での動画再生は未検証です。

ページ内表示用の[取得・保存](https://github.com/itaingtr/keirin-lineup/actions/runs/39746040731)では、50の公開ページから47レースの結果表・304人分の結果・19本の公開済み映像を確認し、原本を非公開に追記・読み戻しました。トップ・日付ページの合計286回の成績表示、緑の選手行、全熊本選手、初日表示、URLが変わらないこと、動画・ライブの表示、閉じる・Escによる再生停止をDOMテストしています。実ブラウザー・実機の描画と再生は未確認です。

配信先の更新だけを受け持つため、同じSitesプロジェクト・閲覧範囲のまま静的配信から依存パッケージ不要のWorkerへ移行しました。`scripts/build_worker.py` が公開用アセットを `worker/index.js` に埋め込み、Sites標準の `scripts/build.sh` と `scripts/validate-artifact.mjs` で `dist/server/index.js` と設定だけを生成・検証します。既存のSupabase接続・保存データ・認証設定は変更しません。

最新の確認後の非公開保存量は10月21日分21,615,322バイト、10月22日分12,970,333バイト、累計35,066,677バイト、24件です。調査中に取得した元ページも保持しています。既存原本の上書き・削除・期限設定はありません。

10月21日版は、[Actions実取得・保存確認](https://github.com/itaingtr/keirin-lineup/actions/runs/39750308302)で当日の14レース・98人・二車単588通りを独立取得しました。24ページの原本と正規化データを新規オブジェクト4件へ非公開追記・読み戻し後に描画しています。`site/line20261021.html/` 内にその日専用のオッズ・結果・映像情報を置き、22日版のデータを混ぜません。トップ・22日版・既存共有ファイルは公開済みのバイト列を保ちます。

ユーザーの追加指示により、トップと10月22日版にもページ内表示を反映しました。この2ページは同じHTMLで更新し、映像・ライブ・過去着順には外部リンクではなく `button` と `data-source-url` を使います。旧スマホ処理の `location.href` と `window.open` は削除しています。`viewer.js` は21日版の既存リンクにも互換対応し、新しい2ページは `inline-20261022b` で読み込みます。出走データ・オッズ・保存原本・10月21日のHTMLは変更していません。
