#!/bin/sh
# Entrypoint script for Cloud Run
# Substitutes PORT environment variable in nginx config

set -e

# Default to 8080 if PORT is not set
export PORT=${PORT:-8080}

# Debug: Print PORT value
echo "Starting nginx on port: $PORT"

# Substitute PORT in nginx config
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Debug: Show generated config
echo "Generated nginx config:"
cat /etc/nginx/conf.d/default.conf | head -5

# Test nginx config
nginx -t

# Start nginx
exec nginx -g 'daemon off;'

