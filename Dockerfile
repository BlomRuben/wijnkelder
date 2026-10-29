# Container voor de wijnkelder-app. GitHub bouwt deze automatisch bij elke
# push (zie .github/workflows/container.yml). Je gegevens zitten niet in de
# container: die staan in /data, dat in Unraid naar de appdata-map wijst.
FROM python:3.12-alpine

WORKDIR /app
COPY server.py index.html ./
COPY css ./css
COPY js ./js

ENV DATA_DIR=/data \
    PORT=8080
VOLUME /data
EXPOSE 8080

CMD ["python", "-u", "server.py"]
