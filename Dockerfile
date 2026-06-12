FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css main.js /usr/share/nginx/html/
EXPOSE 8080
