# Multipaz Server Bundle
# Single image containing all reference servers and web frontend

FROM eclipse-temurin:17-jre-jammy

# Install nginx for reverse proxy
RUN apt-get update && apt-get install -y --no-install-recommends \
   nginx less sqlite3 libsqlite3-dev curl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r multipaz && useradd -r -g multipaz multipaz

WORKDIR /app

# Copy shared dependency JARs (deduplicated across all servers)
COPY deployment/build/docker-staging/libs/ /app/libs/

# Copy thin server JARs
COPY deployment/build/docker-staging/jars/ /app/jars/

# Copy nginx configuration
COPY deployment/docker/nginx.conf /etc/nginx/nginx.conf

# Copy Multipaz services configurations
COPY deployment/docker/services /etc/multipaz

# Root web resource(s)
COPY deployment/docker/web /app/web

# Copy registry web frontend (built by Gradle before docker build)
COPY organizations/registry/frontend/build/dist/js/productionExecutable /app/web
RUN chmod -R 755 /app/web

# Copy initial data
COPY deployment/docker/init/records.json /app/init/records.json

# Copy startup script
COPY deployment/docker/start-servers.sh /app/start-servers.sh
RUN chmod +x /app/start-servers.sh

# Create directories for data and logs
RUN mkdir -p /app/data /app/logs && chown -R multipaz:multipaz /app

# nginx needs to write to these directories
RUN mkdir -p /var/lib/nginx/body /var/log/nginx /run /run/nginx && \
    chown -R multipaz:multipaz /var/lib/nginx /var/log/nginx /run /run/nginx /etc/nginx /etc/multipaz

USER multipaz

# Expose unified port (nginx) and individual service ports
EXPOSE 8100 8001 8002 8004 8009 8010

ENTRYPOINT ["/app/start-servers.sh"]
