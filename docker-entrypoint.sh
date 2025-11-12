#!/bin/sh
# Entrypoint script for Cloud Run
# Substitutes PORT and API_BASE_URL environment variables

set -e

# Default to 8080 if PORT is not set
export PORT=${PORT:-8080}

# Default API_BASE_URL (should be set via Cloud Run env var)
export API_BASE_URL=${API_BASE_URL:-http://localhost:8000/api}

echo "Starting nginx on port: $PORT"
echo "API_BASE_URL: $API_BASE_URL"

# Substitute PORT in nginx config
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Inject API_BASE_URL into index.html
# Replace the script tag that sets window.API_BASE_URL
envsubst '${API_BASE_URL}' < /usr/share/nginx/html/index.html.template > /usr/share/nginx/html/index.html

# Test nginx config
nginx -t

# Start nginx
exec nginx -g 'daemon off;'

