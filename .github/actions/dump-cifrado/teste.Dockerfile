# Imagem só dos testes do dump-cifrado: postgres:18 (pg_dump 18) com age.
FROM postgres:18
RUN apt-get update \
 && apt-get install -y --no-install-recommends age \
 && rm -rf /var/lib/apt/lists/*
