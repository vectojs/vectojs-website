default:
    @just --list

edit:
    @echo "=== Starting Zola Dev Server & Bun Watcher ==="
    @bun run dev

status:
    @echo "=== Checking repository status ==="
    @git status

test:
    @echo "=== Running quality gates ==="
    @if command -v pre-commit &>/dev/null; then pre-commit run --all-files; else echo "pre-commit not found"; fi

deploy: test
    @echo "=== Building Astro site ==="
    @bun run build
    @echo "=== Deploying to Cloudflare Pages ==="
    @./scripts/deploy-pages.sh dist vectojs main

deploy-verify expected_string url="https://vectojs.org":
    @echo "=== Verifying deployment at {{url}} ==="
    @if curl -sL "{{url}}" | grep -q "{{expected_string}}"; then \
        echo "✅ Verified: expected string found at {{url}}"; \
    else \
        echo "❌ Verification failed: expected string '{{expected_string}}' not found at {{url}}" >&2; \
        exit 1; \
    fi

deploy-and-verify expected_string url="https://vectojs.org":
    @just deploy
    @just deploy-verify "{{expected_string}}" "{{url}}"

commit message="":
    @if [ -z "{{message}}" ]; then \
        echo "Error: Commit message required. Usage: just commit \"feat(website): update layout\""; \
        exit 1; \
    fi
    @git add -A
    @git commit -m "{{message}}"

push:
    @echo "=== Pushing commits to GitHub ==="
    @git push origin main
