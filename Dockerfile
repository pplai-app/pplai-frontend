FROM nginx:alpine

# Copy frontend files
COPY index.html /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY api.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/
COPY offline-queue.js /usr/share/nginx/html/

# Copy nginx configuration template
# nginx:alpine's default entrypoint automatically processes .template files
# It uses envsubst to substitute environment variables
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Expose port (Cloud Run sets PORT env var)
EXPOSE 8080

# Use default nginx entrypoint (handles template substitution automatically)
# No CMD needed - nginx:alpine has default CMD
