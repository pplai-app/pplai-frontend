FROM nginx:alpine

# Install gettext for envsubst (for API_BASE_URL injection)
RUN apk add --no-cache gettext

# Copy frontend files
COPY index.html /usr/share/nginx/html/index.html.template
COPY script.js /usr/share/nginx/html/
COPY api.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY offline-queue.js /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/

# Copy nginx configuration template
# nginx:alpine's default entrypoint automatically processes .template files
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy entrypoint script to inject API_BASE_URL
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port (Cloud Run sets PORT env var)
EXPOSE 8080

# Use custom entrypoint to inject API_BASE_URL
ENTRYPOINT ["/docker-entrypoint.sh"]
