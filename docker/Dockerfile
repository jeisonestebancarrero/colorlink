# Etapa de build de la SPA.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Vite las incrusta en el bundle: solo la anon key, nunca la service_role.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . ./

# Sin estas variables el bundle compila pero la página sale en blanco.
RUN test -n "$VITE_SUPABASE_URL" -a -n "$VITE_SUPABASE_ANON_KEY" \
      || (echo "ERROR: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisa 'electica Vl/.env'." && exit 1)

RUN npm run build

# Etapa de runtime: estáticos con nginx.
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
