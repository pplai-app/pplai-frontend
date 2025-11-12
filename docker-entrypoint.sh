#!/bin/sh
# Entrypoint script for Cloud Run
# Substitutes PORT environment variable in nginx config

set -e

# Default to 8080 if PORT is not set
export PORT=${PORT:-8080}

# Substitute PORT in nginx config
envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

# Start nginx
exec nginx -g 'daemon off;'

