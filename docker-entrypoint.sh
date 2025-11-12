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

