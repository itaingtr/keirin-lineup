# 翌日の出走表を自動作成する

`.github/workflows/card-nightly.yml` は日本時間の毎日21:00と23:30に、翌日の楽天Kドリームス出走表を取得します。GitHubの実行開始には遅延があり得ます。

1. 開催一覧からS級のある開催を確認し、各レースの出走表・得点・成績・並びを取得して検証します。
2. 並び未発表のS級戦があれば、その開催を丸ごと除外します。昼・ナイター共通です。
3. 検証済みの正規化データと取得元URL・取得時刻をSupabaseの非公開Storageに追記します。
4. ひな形からトップと対象日の2ページを生成します。オッズの初回取得は当日の10:00で、その後20:00まで毎時取得します。夜の出走表作成ではオッズを取得しません。
5. mainへ保存してPagesへ公開し、2ページが生成結果と一致することを確認します。GitHubの標準トークンによるcommitでは別のPages workflowが起動しないため、夜のworkflow自身がデプロイします。

過去ページは書き換えません。ネットワーク・解析・保存が失敗した場合や、掲載可能なS級戦がゼロの場合は、公開中の出走表を置き換えません。元の倍率・得点を別の日付に付け替えることもありません。

## 一度だけ必要な設定

既存プロジェクトのURLは設定済みです。次のサーバー用キーだけ、リポジトリのActions secretに登録します。

- Supabase: https://supabase.com/dashboard/project/ritinxywblgsccjvqoeh/settings/api-keys
- GitHubのsecret追加画面: https://github.com/itaingtr/keirin-lineup/settings/secrets/actions/new
- **Name:** `SNAPSHOT_SUPABASE_SERVICE_KEY`
- **Secret:** SupabaseのLegacy API Keysにある `service_role` のキー。キーをチャットや公開ファイルへ貼り付けないでください。

登録後、[夜のworkflow](https://github.com/itaingtr/keirin-lineup/actions/workflows/card-nightly.yml) の **Run workflow** を実行すると、接続確認から作成・公開まで試せます。日付欄は空なら日本時間の翌日、指定すればその日です。公開中より過去の日付への巻き戻しは拒否します。

[公開確認workflow](https://github.com/itaingtr/keirin-lineup/actions/workflows/card-publication-check.yml) は、公開中の日付を読み取り、その日付で夜のworkflowを手動実行として起動します。取得・非公開保存・生成・mainへの保存・Pages公開までを、日付を勝手に翌日に進めず確認できます。確認用workflow自体の変更時にも実行します。

キーが未登録なら、最初の保存先確認で停止します。workflow変更のコードpushでは、公開中の日付を対象に、接続・実データ取得・非公開保存・読み戻し・プレビュー生成まで確認し、公開ページは更新しません。未登録かどうかは実際のActions実行で確認します。クラウド開発環境にキーがないことだけでは、Actionsの未設定とは判定しません。

2026-10-18に保存用secretの登録を確認しました。[接続確認](https://github.com/itaingtr/keirin-lineup/actions/runs/39095495600)で19レースの取得・非公開保存・読み戻しが成功し、その後の[通常workflowの確認実行](https://github.com/itaingtr/keirin-lineup/actions/runs/39095621477)では、30件のテスト、取得、保存、生成、mainへの保存処理、Pages公開、公開されたトップと日付ページの内容照合まで成功しました。

この時点の保存量は2026-10-18分2件、計209,400バイトです。2回の確認で作ったデータも削除せず保持しています。21:00・23:30のスケジュールは登録済みで、定時起動そのものの結果は各夜の実行後にActionsで確認します。保存用キーの再登録は不要です。

## データの保管

`scripts/archive_snapshot.py` は既存の非公開バケット `keirin-source-snapshots` を使用し、なければ非公開で作成します。公開バケットだった場合はアップロードせず停止します。
`supabase/snapshots.sql` は猫のログインアカウント向けの閲覧ポリシーを追加したい場合に利用できます。サーバー保存だけなら手動SQLは不要です。

日付・取得時刻・乱数による新しいオブジェクト名で保存し、同名上書き・自動期限・自動削除は設定しません。保存後は認証つきで読み戻し、全データが一致してから公開へ進みます。最低5年間保管し、5年後も削除前にはデータ提供とユーザーの明示的な許可が必要です。
容量不足なら新規保存と公開を停止し、既存データを残します。各実行のSummaryに対象日と累計の容量を表示します。キー・元のHTML・非公開JSONを公開ブランチやPages artifactへ含めません。

手動の `card-prepare.yml` は従来どおり、確認用HTMLとオッズを用意するだけでトップを公開し直しません。新たな夜の自動公開とは別です。
