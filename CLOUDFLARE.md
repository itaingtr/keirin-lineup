# Cloudflare Pagesで公開する

リポジトリ `itaingtr/keirin-lineup` をCloudflare PagesのGitHub連携につなぐ。
既存のGitHub Pagesと並行して公開できる。Cloudflareへの初回ログインとGitHubアプリの認証は、アカウント所有者が管理画面で行う。

## 接続設定

1. [Cloudflare管理画面](https://dash.cloudflare.com/)で **Workers & Pages → Create application → Pages → Import an existing Git repository** を開く。
2. GitHubを認証し、`itaingtr/keirin-lineup` へのアクセスを許可する。
3. 次の設定を入力して **Save and Deploy** を選ぶ。

| 項目 | 値 |
| --- | --- |
| Repository | `itaingtr/keirin-lineup` |
| Production branch | `main` |
| Framework preset | `None` |
| Root directory | 空欄（リポジトリのルート） |
| Build command | `python3 scripts/build_cloudflare.py` |
| Build output directory | `dist-cloudflare` |

プレビュー用ブランチの自動デプロイは無効にする。`odds-diagnostics` は公開用オッズJSONのブランチで、このサイトをビルドするブランチではない。

Git連携の初期設定に、Cloudflare APIトークンの手動登録は不要。

## ビルドの内容

`python3 scripts/build_cloudflare.py` は `site/` だけを `dist-cloudflare/` にコピーする。公開用のコピーで次を変換する。

- `/keirin-lineup/` から始まるCSS・JavaScript・オッズ設定の読み込み先を、Cloudflareのルートに合わせる。
- 日付選択のGitHub Pagesへのリンクを、同じCloudflareサイト内のリンクにする。
- 掲示板のメールログイン後の戻り先を、閲覧中のCloudflareサイトのルートにする。
- 古い `/keirin-lineup/` 付きのURLからのリダイレクトと、未公開ページ用の404ページを追加する。

`site/`、過去の日付ページ、テンプレート、既存のGitHub Pages公開処理は変更しない。オッズJSONの取得先もそのまま使用する。収集元データや非公開の保存領域はビルド出力に含めない。

## 掲示板のログイン

初回デプロイ後、Cloudflareが返した本番URLを使って設定する。プロジェクト名からURLを推測しない。

1. [Supabase Authentication → URL Configuration](https://supabase.com/dashboard/project/ritinxywblgsccjvqoeh/auth/url-configuration)を開く。
2. **Redirect URLs** に、Cloudflareの本番URLを末尾の `/` 付きで追加する。
3. 既存のSite URLとGitHub Pagesの許可先は保持する。

設定するURLは実際の本番URLに限定する。独自ドメインを追加した場合は、そのドメインのルートURLも追加する。掲示板のデータと投稿権限は既存のものを使い、ブラウザのログイン状態はドメインごとに管理される。

## 接続後の確認

- Cloudflareのデプロイが成功し、対象コミットが `main` の公開したいコミットになっていること。
- トップ、過去の日付ページ、CSS、オッズ、掲示板が読み込めること。
- 日付を選んでもCloudflareのドメイン内にとどまること。
- メールログイン後にCloudflareへ戻り、許可されたユーザーが投稿できること。
- 夜間Actionsが `main` を更新した後も、Cloudflareのデプロイ履歴と公開日付を確認すること。既存のGitHub Pagesの公開成功だけでは、Cloudflare側の更新完了とは判定しない。

## 公式ドキュメント

- [Cloudflare PagesのGit連携](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Cloudflare Pagesのビルド設定](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- [Supabaseのログイン許可先URL](https://supabase.com/docs/guides/auth/redirect-urls)
