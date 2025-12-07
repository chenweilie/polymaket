FROM nginx:alpine

COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY debug.html /usr/share/nginx/html/
COPY test-standalone.html /usr/share/nginx/html/
COPY test.html /usr/share/nginx/html/

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY .htpasswd /etc/nginx/.htpasswd

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
