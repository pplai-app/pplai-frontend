#!/bin/sh
# Entrypoint script for Cloud Run
# Substitutes PORT and API_BASE_URL environment variables

set -e

# Default to 8080 if PORT is not set
export PORT=${PORT:-8080}

# Default API_BASE_URL (should be set via Cloud Run env var)
export API_BASE_URL=${API_BASE_URL:-http://localhost:8000/api}

echo "=========================================="
echo "Starting nginx on port: $PORT"
echo "API_BASE_URL: $API_BASE_URL"
echo "=========================================="

# Substitute PORT in nginx config
echo "Substituting PORT in nginx config..."
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Verify nginx config was created
if [ ! -f /etc/nginx/conf.d/default.conf ]; then
    echo "❌ ERROR: nginx config file was not created!"
    exit 1
fi

# Show first few lines of generated config
echo "Generated nginx config (first 5 lines):"
head -5 /etc/nginx/conf.d/default.conf

# Inject API_BASE_URL into index.html
echo "Injecting API_BASE_URL into index.html..."
envsubst '${API_BASE_URL}' < /usr/share/nginx/html/index.html.template > /usr/share/nginx/html/index.html

# Verify index.html was created
if [ ! -f /usr/share/nginx/html/index.html ]; then
    echo "❌ ERROR: index.html was not created!"
    exit 1
fi

# Test nginx config
echo "Testing nginx configuration..."
if ! nginx -t; then
    echo "❌ ERROR: nginx configuration test failed!"
    exit 1
fi

echo "✅ Configuration valid, starting nginx..."

# Start nginx in foreground mode
exec nginx -g 'daemon off;'

