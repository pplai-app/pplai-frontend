FROM nginx:alpine

# Copy frontend files
COPY index.html /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY api.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/
COPY offline-queue.js /usr/share/nginx/html/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

