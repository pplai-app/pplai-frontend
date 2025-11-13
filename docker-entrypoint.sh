#!/bin/sh
# Entrypoint script for Cloud Run
# Substitutes PORT and API_BASE_URL environment variables

set -e

# Default to 8080 if PORT is not set
export PORT=${PORT:-8080}

# Default API_BASE_URL (should be set via Cloud Run env var)
export API_BASE_URL=${API_BASE_URL:-http://localhost:8000/api}

# Default GOOGLE_CLIENT_ID (should be set via Cloud Run env var)
export GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}

echo "=========================================="
echo "Starting nginx on port: $PORT"
echo "API_BASE_URL: $API_BASE_URL"
echo "=========================================="

# Substitute PORT in nginx config
echo "Substituting PORT in nginx config..."
echo "PORT value: $PORT"
echo "Template file exists: $(test -f /etc/nginx/templates/default.conf.template && echo 'yes' || echo 'no')"

# Use envsubst to replace ${PORT} with actual value
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Verify nginx config was created
if [ ! -f /etc/nginx/conf.d/default.conf ]; then
    echo "❌ ERROR: nginx config file was not created!"
    exit 1
fi

# Show first few lines of generated config
echo "Generated nginx config (first 10 lines):"
head -10 /etc/nginx/conf.d/default.conf

# Check if PORT was actually substituted
if grep -q '\${PORT}' /etc/nginx/conf.d/default.conf; then
    echo "❌ ERROR: PORT variable was not substituted!"
    echo "Config still contains \${PORT}:"
    grep '\${PORT}' /etc/nginx/conf.d/default.conf
    exit 1
fi

# Verify PORT is a valid number in the config
if ! grep -q "listen $PORT" /etc/nginx/conf.d/default.conf; then
    echo "❌ ERROR: PORT $PORT not found in nginx config!"
    echo "Looking for 'listen $PORT' but found:"
    grep "listen" /etc/nginx/conf.d/default.conf
    exit 1
fi

# Inject API_BASE_URL and GOOGLE_CLIENT_ID into index.html
echo "Injecting API_BASE_URL and GOOGLE_CLIENT_ID into index.html..."
echo "Checking if index.html.template exists..."
if [ ! -f /usr/share/nginx/html/index.html.template ]; then
    echo "⚠️  WARNING: index.html.template not found, checking for index.html..."
    if [ -f /usr/share/nginx/html/index.html ]; then
        echo "✅ index.html exists, using it directly (no template substitution)"
        # Still try to inject if possible, but don't fail if template doesn't exist
        if command -v envsubst >/dev/null 2>&1; then
            # Try to inject variables into existing index.html
            envsubst '${API_BASE_URL} ${GOOGLE_CLIENT_ID}' < /usr/share/nginx/html/index.html > /usr/share/nginx/html/index.html.tmp && \
            mv /usr/share/nginx/html/index.html.tmp /usr/share/nginx/html/index.html
        fi
    else
        echo "❌ ERROR: Neither index.html.template nor index.html found!"
        exit 1
    fi
else
    envsubst '${API_BASE_URL} ${GOOGLE_CLIENT_ID}' < /usr/share/nginx/html/index.html.template > /usr/share/nginx/html/index.html
fi

# Verify index.html was created
if [ ! -f /usr/share/nginx/html/index.html ]; then
    echo "❌ ERROR: index.html was not created!"
    exit 1
fi
echo "✅ index.html created successfully"

# Test nginx config
echo "Testing nginx configuration..."
if ! nginx -t; then
    echo "❌ ERROR: nginx configuration test failed!"
    exit 1
fi

echo "✅ Configuration valid, starting nginx..."

# Start nginx in foreground mode
exec nginx -g 'daemon off;'

