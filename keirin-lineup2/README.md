# keirin-lineup2

既存の `itaingtr/keirin-lineup` と独立した予備サイトです。元のCSS・左右2表・合成オッズ・検索・PCの750×470映像ポップアップ・スマートフォンの同一画面遷移を引き継いでいます。元サイトと過去ページは変更しません。

## 取得元

- 優先候補のエンジョイは、2026-10-22のGitHub Actionsでトップ・出走表ともHTTP 404でした。Web検索で閲覧できることを、自動取得成功とは扱いません。URLの検証・描画は対応しますが、自動収集は未接続です。
- 今回の実働候補はWINTICKETです。ログアウト状態の公開ページ内の `__PRELOADED_STATE__` に含まれる出走表・並び・二車単を読みます。非公開API、ログイン、Kドリームスのデータやフィードには接続しません。
- WINTICKETの選手成績を、同じページの出走表の表示値とも照合します。選手名・期別・直近4か月得点・S/B/逃/捲/差/マは元の数値を保持し、描画時だけ得点を整数表示します。予想印のない選手は空欄です。
- 二車単の順序付き `key: [1,2]` を1着1番・2着2番として扱います。全組合せ・車番・賭式・レースIDを検証し、元の `oddsUpdatedAt` を観測時刻として保ちます。取得失敗を0やnullで埋めません。
- 出走表・並びが欠けた開催は丸ごと除外し、通信や検証に失敗したら既存の表示を保持します。Kドリームスの値を別取得元として付け替えません。

各サイトの公開情報を読めることは、自動取得・保存・転載の一般的な許諾の証明ではありません。今回の確認は独立した試作です。転載権限・収集頻度等の条件を確認せずに無人の一般公開運用へ進めません。記事、写真、予想本文は転載しません。

## 映像

「映像を見る」は `https://www.winticket.jp/keirin/{場名}/raceresult/{開催初日YYYYMMDD}{場コード}/{開催日目}/{レース番号}`、青い「ライブ」は `https://www.winticket.jp/keirin/{場名}/live` を開きます。2026-10-22熊本12Rの公式ページでURLを確認しました。期限付きの配信ファイルを抽出・埋め込みする方式ではありません。

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

## 検証

```sh
python3 -m unittest discover -s tests -v
node --check site/odds-current.js
node --check site/odds-comparison.js
```

自動スケジュールはまだ設定しません。実データの取得・非公開保存・描画が通ってから、運用先に合わせて接続します。
