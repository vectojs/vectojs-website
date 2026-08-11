default:
    @just --list

# Start development servers (Bun watch + Zola serve)
dev:
    @echo "Starting dev servers..."
    @bun run dev

# Build for production
build:
    @echo "Building site..."
    @bun run build

# Deploy to Cloudflare Pages
deploy:
    @echo "Deploying to Cloudflare Pages..."
    @HTTPS_PROXY=$NETWORK_PROXY bun run deploy

# Format code
format:
    @bun run format

# Check formatting and linting
check:
    @bun run check

# Clean build artifacts
clean:
    @rm -rf static/js/*.js static/js/*.js.map public/
    @echo "Cleaned build artifacts"
