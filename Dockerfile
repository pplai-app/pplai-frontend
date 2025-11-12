FROM nginx:alpine

# Install gettext for envsubst
RUN apk add --no-cache gettext

# Copy frontend files
COPY index.html /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY api.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/
COPY offline-queue.js /usr/share/nginx/html/

# Copy nginx configuration template (nginx:alpine auto-processes .template files)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Expose port (Cloud Run will set PORT env var)
EXPOSE 8080

# Use default nginx entrypoint which handles template substitution
# No custom entrypoint needed - nginx:alpine does this automatically
