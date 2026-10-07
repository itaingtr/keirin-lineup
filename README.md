# 競輪並び・選手一覧

GitHub Pagesで公開するための静的サイト一式です。現在の `site/index.html` は2026年10月7日のS級戦一覧です。

## 自動公開

GitHubにリポジトリを作り、この一式を `main` ブランチへ置くと、`.github/workflows/pages.yml` がGitHub Pagesへ自動で公開します。以後 `site/index.html` を更新して `main` に反映するたびに、サイトも更新されます。Actionsタブから手動実行もできます。

初回はリポジトリの **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選びます。

公開URLは、リポジトリの **Settings → Pages** または成功したActions実行の `github-pages` 環境から確認できます。

