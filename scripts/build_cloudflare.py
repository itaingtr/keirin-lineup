#!/usr/bin/env python3
"""Build a Cloudflare Pages copy without changing the GitHub Pages sources."""

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "site"
OUTPUT = ROOT / "dist-cloudflare"
GITHUB_URL = "https://itaingtr.github.io/keirin-lineup/"


def build():
    if not (SOURCE / "index.html").is_file():
        raise SystemExit("site/index.html is required")
    if OUTPUT.is_symlink():
        raise SystemExit("dist-cloudflare must not be a symbolic link")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(SOURCE, OUTPUT)

    count = 0
    for path in sorted(OUTPUT.rglob("*")):
        if not path.is_file() or path.suffix not in {".html", ".js", ".css", ".json"}:
            continue
        text = path.read_text(encoding="utf-8")
        if path == OUTPUT / "comments.js":
            redirect = f"emailRedirectTo: '{GITHUB_URL}'"
            if redirect not in text:
                raise SystemExit("Review the comments login redirect before building")
            text = text.replace(
                redirect, "emailRedirectTo: new URL('/', location.origin).href"
            )
        text = text.replace(GITHUB_URL, "/")
        # Match path literals, keeping external GitHub repository URLs intact.
        for quote in ('"', "'"):
            text = text.replace(quote + "/keirin-lineup/", quote + "/")
        path.write_text(text, encoding="utf-8")
        count += 1

    with (OUTPUT / "_redirects").open("a", encoding="utf-8") as redirects:
        redirects.write("\n/keirin-lineup / 302\n/keirin-lineup/* /:splat 302\n")
    if not (OUTPUT / "404.html").exists():
        (OUTPUT / "404.html").write_text(
            '<!doctype html><html lang="ja"><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>ページが見つかりません</title>'
            '<h1>ページが見つかりません</h1>'
            '<p>指定した日付のページはまだ公開されていないか、見つかりません。</p>'
            '<a href="/">トップへ戻る</a></html>\n',
            encoding="utf-8",
        )
    print(f"Cloudflare Pages: prepared {count} text files in {OUTPUT.name}/")


if __name__ == "__main__":
    build()
