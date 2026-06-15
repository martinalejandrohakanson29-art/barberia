FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css main.js config.js booking.js logo-transparent.png local.jpg /usr/share/nginx/html/
COPY admin/ /usr/share/nginx/html/admin/
EXPOSE 8080
