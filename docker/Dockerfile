# ---- Etapa 1: build de la SPA (React + Vite) ----
FROM node:22-alpine AS build

WORKDIR /app

# Lockfile presente: build reproducible con npm ci
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Variables que Vite incrusta en el bundle en tiempo de build.
# La anon key es pública por diseño: toda la autorización la aplica RLS.
# La service_role key NUNCA debe pasarse aquí.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY . ./

# Falla temprano y con un mensaje claro, en vez de producir una página en
# blanco cuando el navegador ejecute el bundle.
RUN test -n "$VITE_SUPABASE_URL" -a -n "$VITE_SUPABASE_ANON_KEY" \
      || (echo "ERROR: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Revisa 'electica Vl/.env'." && exit 1)

RUN npm run build

# ---- Etapa 2: servir estáticos con nginx ----
FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
